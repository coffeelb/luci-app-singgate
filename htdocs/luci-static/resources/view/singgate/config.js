// Copyright (C) 2026 COFFEELB

'use strict';
'require dom';
'require fs';
'require ui';
'require uci';
'require view';

const CONFIG_FILE = '/etc/singgate/config.json';
const CHECK_FILE = '/tmp/singgate-check.json';
const DEFAULT_WORK_DIR = '/etc/singgate';
const SINGBOX_BIN = '/usr/bin/sing-box';
const INIT_SCRIPT = '/etc/init.d/singgate';
const FILE_MODE = 0o600;
const ANSI_RE = /\x1b\[[0-9;]*m/g;  // sing-box colours its output even when piped

function normalize(text) {
	const t = text.replace(/\r\n/g, '\n');

	return t.endsWith('\n') ? t : t + '\n';
}

/* Validate with the real binary: sing-box accepts comments and has many
 * version-specific rules, so a browser-side JSON.parse would be wrong. */
async function getWorkDir() {
	await L.resolveDefault(uci.load('singgate'));

	return uci.get('singgate', 'main', 'work_dir') || DEFAULT_WORK_DIR;
}

async function checkConfig(text, workDir) {
	await fs.write(CHECK_FILE, text, FILE_MODE);

	try {
		return await fs.exec(SINGBOX_BIN, [ 'check', '-c', CHECK_FILE, '-D', workDir ]);
	}
	finally {
		await L.resolveDefault(fs.remove(CHECK_FILE));
	}
}

function errorText(res) {
	return (res.stderr || res.stdout || '').replace(ANSI_RE, '').trim();
}

return view.extend({
	handleSave: null,
	handleSaveApply: null,
	handleReset: null,

	load() {
		return Promise.all([ L.resolveDefault(fs.read(CONFIG_FILE), ''), getWorkDir() ]);
	},

	render([ content, workDir ]) {
		const editor = E('textarea', {
			'class': 'cbi-input-textarea',
			'rows': 30,
			'wrap': 'off',
			'spellcheck': 'false',
			'style': 'width:100%; font-family:monospace; font-size:13px; tab-size:2'
		});
		editor.value = content;

		const output = E('div', { 'style': 'margin-top:1em' });

		const showResult = (ok, message) => dom.content(output,
			E('div', { 'class': 'alert-message ' + (ok ? 'info' : 'danger') },
				E('pre', { 'style': 'white-space:pre-wrap; margin:0' }, message)));

		const guarded = (fn) => ui.createHandlerFn(this, async () => {
			try {
				await fn();
			}
			catch (e) {
				showResult(false, e.message);
			}
		});

		const check = guarded(async () => {
			const res = await checkConfig(normalize(editor.value), workDir);

			showResult(res.code === 0, res.code === 0 ? _('Configuration is valid.') : errorText(res));
		});

		const save = (restart) => guarded(async () => {
			const text = normalize(editor.value);
			const res = await checkConfig(text, workDir);

			if (res.code !== 0) {
				showResult(false, _('Not saved: the configuration is invalid.') + '\n\n' + errorText(res));
				return;
			}

			await fs.write(CONFIG_FILE, text, FILE_MODE);
			editor.value = text;

			if (!restart) {
				showResult(true, _('Saved. Restart the service to apply the changes.'));
				return;
			}

			const r = await fs.exec(INIT_SCRIPT, [ 'restart' ]);

			if (r.code !== 0)
				throw new Error(_('Saved, but the service failed to restart:') + '\n' + errorText(r));

			showResult(true, _('Saved. The service was restarted.'));
		});

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', _('SingGate configuration')),
			E('div', { 'class': 'cbi-map-descr' },
				_('Edit the sing-box JSON configuration directly. It is validated with "sing-box check" before it is saved.')),
			E('div', { 'class': 'cbi-section' }, [
				editor,
				output,
				E('div', { 'class': 'cbi-page-actions' }, [
					E('button', { 'class': 'btn cbi-button cbi-button-action', 'click': check }, _('Check')),
					' ',
					E('button', { 'class': 'btn cbi-button cbi-button-save', 'click': save(false) }, _('Save')),
					' ',
					E('button', { 'class': 'btn cbi-button cbi-button-positive', 'click': save(true) }, _('Save and restart'))
				])
			])
		]);
	}
});

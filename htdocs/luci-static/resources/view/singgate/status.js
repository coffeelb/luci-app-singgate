// Copyright (C) 2026 COFFEELB

'use strict';
'require dom';
'require fs';
'require poll';
'require rpc';
'require ui';
'require view';

const SERVICE = 'singgate';
const INIT_SCRIPT = '/etc/init.d/singgate';
const SINGBOX_BIN = '/usr/bin/sing-box';
const POLL_INTERVAL = 5;
const ANSI_RE = /\x1b\[[0-9;]*m/g;  // sing-box colours its log output

const callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: [ 'name' ],
	expect: { '': {} }
});

async function getStatus() {
	const res = await L.resolveDefault(callServiceList(SERVICE), {});
	const instances = Object.values(res[SERVICE]?.instances ?? {});
	const running = instances.find((i) => i.running);

	return { running: Boolean(running), pid: running?.pid };
}

async function getVersion() {
	const res = await L.resolveDefault(fs.exec(SINGBOX_BIN, [ 'version' ]), null);

	return res?.stdout?.split('\n')[0]?.trim() || null;
}

async function isBootEnabled() {
	const res = await L.resolveDefault(fs.exec(INIT_SCRIPT, [ 'enabled' ]), null);

	return res?.code === 0;
}

async function getLog() {
	const res = await L.resolveDefault(fs.exec(INIT_SCRIPT, [ 'read_log' ]), null);

	return (res?.stdout ?? '').replace(ANSI_RE, '').trimEnd();
}

async function runInit(action) {
	const res = await fs.exec(INIT_SCRIPT, [ action ]);

	if (res.code !== 0)
		throw new Error((res.stderr || res.stdout || '').replace(ANSI_RE, '').trim() ||
			_('Command failed with exit code %d').format(res.code));
}

return view.extend({
	handleSave: null,
	handleSaveApply: null,
	handleReset: null,

	load() {
		return Promise.all([ getStatus(), getVersion(), isBootEnabled(), getLog() ]);
	},

	render([ status, version, bootEnabled, log ]) {
		const stateEl = E('strong');
		const pidEl = E('span');
		const logEl = E('textarea', {
			'class': 'cbi-input-textarea',
			'readonly': 'readonly',
			'wrap': 'off',
			'rows': 20,
			'style': 'width:100%; font-family:monospace; font-size:12px'
		});

		const renderStatus = (st) => {
			dom.content(stateEl, st.running ? _('Running') : _('Stopped'));
			stateEl.style.color = st.running ? 'green' : 'red';
			dom.content(pidEl, st.running && st.pid ? ' (PID %d)'.format(st.pid) : '');
		};

		const renderLog = (text) => {
			const atBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 20;

			logEl.value = text || _('No log entries yet.');
			if (atBottom)
				logEl.scrollTop = logEl.scrollHeight;
		};

		const refresh = async () => {
			const [ st, lg ] = await Promise.all([ getStatus(), getLog() ]);

			renderStatus(st);
			renderLog(lg);
		};

		const control = (action) => ui.createHandlerFn(this, async () => {
			try {
				await runInit(action);
				// Give procd a moment so a crash right after start is visible.
				await new Promise((resolve) => window.setTimeout(resolve, 1500));
				await refresh();
			}
			catch (e) {
				ui.addNotification(null, E('p', e.message), 'danger');
			}
		});

		const clear = ui.createHandlerFn(this, async () => {
			try {
				await runInit('clear_log');
				await refresh();
			}
			catch (e) {
				ui.addNotification(null, E('p', e.message), 'danger');
			}
		});

		const bootBox = E('input', { 'type': 'checkbox' });
		bootBox.checked = bootEnabled;
		bootBox.addEventListener('change', async () => {
			const want = bootBox.checked;

			try {
				await runInit(want ? 'enable' : 'disable');
			}
			catch (e) {
				bootBox.checked = !want;
				ui.addNotification(null, E('p', e.message), 'danger');
			}
		});

		const row = (title, content) => E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title' }, title),
			E('div', { 'class': 'cbi-value-field' }, content)
		]);

		renderStatus(status);
		renderLog(log);
		window.setTimeout(() => { logEl.scrollTop = logEl.scrollHeight; }, 0);

		poll.add(refresh, POLL_INTERVAL);

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', _('SingGate')),
			E('div', { 'class': 'cbi-section' }, [
				row(_('Service'), [ stateEl, pidEl ]),
				row(_('sing-box version'), version ?? _('Not found')),
				row(_('Start on boot'), bootBox),
				row(_('Control'), E('div', { 'style': 'display:flex; gap:.5em; flex-wrap:wrap' }, [
					E('button', { 'class': 'btn cbi-button cbi-button-positive', 'click': control('start') }, _('Start')),
					E('button', { 'class': 'btn cbi-button cbi-button-negative', 'click': control('stop') }, _('Stop')),
					E('button', { 'class': 'btn cbi-button cbi-button-action', 'click': control('restart') }, _('Restart'))
				]))
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'style': 'display:flex; align-items:center; justify-content:space-between; gap:.5em; margin-bottom:.5em' }, [
					E('h3', { 'style': 'margin:0' }, _('Log')),
					E('button', { 'class': 'btn cbi-button cbi-button-negative', 'click': clear }, _('Clear log'))
				]),
				logEl
			])
		]);
	}
});

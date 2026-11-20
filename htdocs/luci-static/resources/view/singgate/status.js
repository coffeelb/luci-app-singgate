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
const POLL_INTERVAL = 5;
const ANSI_RE = /\x1b\[[0-9;]*m/g;  // sing-box colours its log output

const callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: [ 'name' ],
	reject: true,
	nobatch: true
});

async function getStatus() {
	let res;
	try {
		res = await callServiceList(SERVICE);
	}
	catch (e) {
		return null;
	}

	// LuCI can return a bare success code when procd has no instances to report.
	if (res === 0 || res === null || (Array.isArray(res) && res.length === 0))
		return { running: false };
	if (!res || typeof res !== 'object' || Array.isArray(res))
		return null;
	const instances = res[SERVICE]?.instances ?? {};
	const running = [ instances.main, instances.instance1 ].find(instance => instance?.running);

	return { running: Boolean(running), pid: running?.pid };
}

async function getVersion() {
	const res = await L.resolveDefault(fs.exec(INIT_SCRIPT, [ 'version' ]), null);

	return res?.stdout?.split('\n')[0]?.trim() || null;
}

async function isBootEnabled() {
	const res = await L.resolveDefault(fs.exec(INIT_SCRIPT, [ 'enabled' ]), null);

	return res?.code === 0 ? true : res?.code === 1 ? false : null;
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

	render() {
		const stateEl = E('strong', {}, '—');
		const pidEl = E('span');
		const versionEl = E('span', {}, '—');
		const logEl = E('textarea', {
			'class': 'cbi-input-textarea',
			'readonly': 'readonly',
			'wrap': 'off',
			'rows': 20,
			'style': 'width:100%; font-family:monospace; font-size:12px'
		});

		const renderStatus = (st) => {
			dom.content(stateEl, st == null ? _('Unknown') : st.running ? _('Running') : _('Stopped'));
			stateEl.style.color = st == null ? '' : st.running ? 'green' : 'red';
			dom.content(pidEl, st?.running && st.pid ? ' (PID %d)'.format(st.pid) : '');
		};

		const renderLog = (text) => {
			const nextText = text || _('No log entries yet.');
			if (logEl.value === nextText)
				return;

			const atBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 20;

			logEl.value = nextText;
			if (atBottom)
				logEl.scrollTop = logEl.scrollHeight;
		};

		let logRequest;
		const syncLog = () => {
			if (logRequest)
				return logRequest;

			const request = getLog().then(text => {
				if (logRequest === request)
					renderLog(text);
			}).finally(() => {
				if (logRequest === request)
					logRequest = null;
			});
			logRequest = request;
			return request;
		};

		const refresh = () => Promise.all([
			getStatus().then(renderStatus),
			syncLog()
		]);

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
				logRequest = null;
				await syncLog();
			}
			catch (e) {
				ui.addNotification(null, E('p', e.message), 'danger');
			}
		});

		const bootBox = E('input', { 'type': 'checkbox' });
		bootBox.disabled = true;
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

		window.setTimeout(() => {
			getVersion().then(version => dom.content(versionEl, version ?? _('Not found')));
			isBootEnabled().then(enabled => {
				if (enabled != null) {
					bootBox.checked = enabled;
					bootBox.disabled = false;
				}
			});
		}, 0);

		poll.add(() => document.hidden ? getStatus().then(renderStatus) : refresh(), POLL_INTERVAL);

		document.addEventListener('visibilitychange', () => {
			if (!document.hidden)
				syncLog();
		});

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', _('SingGate')),
			E('div', { 'class': 'cbi-section' }, [
				row(_('Service'), [ stateEl, pidEl ]),
				row(_('sing-box version'), versionEl),
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

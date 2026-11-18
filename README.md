# luci-app-singgate

A minimal LuCI app for [sing-box](https://sing-box.sagernet.org/): service control and a raw JSON
config editor. There is no GUI abstraction over sing-box's options; you edit sing-box's own JSON.

## Features

- **Status**: running state, PID, sing-box version, start/stop/restart, start on boot, recent log.
  **Clear log** empties only the SingGate log file. New entries appear without restarting the service.
- **Configuration**: edit `/etc/singgate/config.json` in the browser. Every check and save runs
  `sing-box check` with the real binary, so comments and version-specific rules are handled by
  sing-box itself. An invalid config is never saved.

## Design

- The views call `/etc/init.d/singgate` and query the sing-box version through rpcd.
- One optional UCI setting, `work_dir` in `/etc/config/singgate` (default `/etc/singgate`):
  the directory passed to sing-box as `-D`. Both the init script and the Check/Save button read it,
  so validation and the running service resolve relative paths the same way. Set it to
  `/var/run/singgate` to keep cache files and downloaded rule sets off flash (they are lost on
  reboot). Restart the service after changing it.
- The init script (procd) validates the config before starting and logs the reason if it fails.
- The default config is a TUN inbound with `auto_route` + `auto_redirect` and a `direct` outbound,
  i.e. traffic is captured but passed through unchanged. sing-box's `auto_redirect` inserts its own
  nftables rules (including the fw4 compatibility rules), so this app contains no firewall code.
- The config file is kept at mode 0600 because it usually holds credentials.

## Requirements

- OpenWrt / ImmortalWrt with fw4 and JS-based LuCI.
- sing-box 1.14.x (the default config was checked with `sing-box check` on 1.14.4).
- Packages: `sing-box`, `firewall4`, `kmod-tun`, `kmod-nft-queue`, `kmod-nfnetlink-queue`.

## Installation notes

- `sing-box` must be a regular file at `/usr/bin/sing-box`. rpcd resolves symlinks before checking
  the ACL, so if that path is a symlink (for example to a newer core you installed yourself) the
  version call is denied. Either put the real binary there or add the symlink
  target to `root/usr/share/rpcd/acl.d/luci-app-singgate.json` (`exec` under `write`).
- `root/etc/init.d/singgate` must be mode 755. `luci.mk` copies `root/` preserving modes, and an
  archive extracted on Windows loses the executable bit, so run `chmod 755` on it before building.

## Build

Put this directory under `package/` (or in a custom feed) of an OpenWrt SDK / source tree:

```sh
make package/luci-app-singgate/compile V=s
```

## Notes

- SingGate writes to the fixed path `/var/log/singgate/singgate.log` in RAM. The status page shows
  the last 200 lines. While SingGate runs, it checks the log every 5 seconds and clears it at
  64 KiB or more. Logs can temporarily exceed this threshold between checks. Rebooting clears
  this file.
- Remove `log.output` from the sing-box JSON. SingGate manages its log path and leaves the JSON
  unchanged when validation fails.
- Status: only syntax-checked and validated against sing-box here. Not yet tested on a router.

## License

MIT

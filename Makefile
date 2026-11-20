# Copyright (C) 2026 COFFEELB
# SPDX-License-Identifier: MIT
#
# SingGate - minimal LuCI app for sing-box: service control + raw JSON config editor

include $(TOPDIR)/rules.mk

LUCI_TITLE:=SingGate - minimal sing-box service control and JSON config editor
LUCI_PKGARCH:=all
# auto_redirect (nftables) needs fw4; its pre-matching needs kernel nfqueue support.
LUCI_DEPENDS:= \
	+sing-box \
	+firewall4 \
	+kmod-tun \
	+kmod-nft-queue \
	+kmod-nfnetlink-queue

PKG_NAME:=luci-app-singgate
PKG_VERSION:=0.2.0
PKG_RELEASE:=13
PKG_LICENSE:=MIT

# Pin the translation package version (this package is not part of the luci feed git history).
PKG_PO_VERSION:=$(PKG_VERSION)-r$(PKG_RELEASE)

define Package/$(PKG_NAME)/conffiles
/etc/config/singgate
/etc/singgate/config.json
endef

define Package/$(PKG_NAME)/preinst
#!/bin/sh
if [ "$$APK_SCRIPT" = "pre-upgrade" ] && [ "$$2" = "0.2.0-r7" ] && [ -z "$$IPKG_INSTROOT" ]; then
	ubus -t 3 call service delete '{"name":"singgate","instance":"log_maintenance"}' >/dev/null 2>&1
fi
exit 0
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature

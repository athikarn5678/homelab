# homelab

Configuration and small tools for my personal homelab: a Proxmox VE host with
pfSense providing routing and VLAN segmentation, and services exposed to the
internet only through a Cloudflare Tunnel protected by Cloudflare Access.

## Sub-projects

| Directory | Description |
|-----------|-------------|
| [`dev-gate/`](dev-gate/) | Cloudflare Access auto-login proxy for T3 Code, with logout and session expiry |

import { FiCpu, FiDatabase, FiLink, FiBox, FiZap, FiShield, FiActivity, FiLock } from 'react-icons/fi';
import { FaGamepad } from 'react-icons/fa';
import { LuBrainCircuit } from 'react-icons/lu';

export const CATEGORY_TOOLTIPS = {
  computing:     'Volunteer & distributed computing (Folding@Home, BOINC, Rosetta)',
  gaming:        'Game servers (Palworld, Minecraft, Valheim, Enshrouded) — the marketing site for a game server counts as Web, not here',
  communication: 'Chat, messaging & voice servers (BChat/DexChat, Streamr, TeamSpeak, Element, SimpleX)',
  web:           'Websites, CMS & alternative frontends (WordPress, Nextcloud, Ghost) — includes the dedicated website for an app, e.g. minecraft-server-website',
  blockchain:    'Blockchain nodes & explorers (Beldex master nodes, Bitcoin, Kaspa, Blockbook, Firo)',
  database:      'Database & queue servers (MySQL, PostgreSQL, MongoDB, Redis, RabbitMQ)',
  devops:        'CI/CD, automation & remote access (n8n, Budibase, code-server, RustDesk, Gitea)',
  media:         'Media servers & downloaders (Owncast, Jellyfin, qBittorrent, Navidrome)',
  ai:            'AI & machine learning workloads (Ollama, Doccano, Rasa, vLLM)',
  vpn:           'VPN, privacy, proxy & bandwidth-sharing (SoftEther, Presearch, CumulusVPN, Shadowsocks)',
  monitoring:    'Observability & network probes (Globalping, Grafana, Uptime-Kuma, Netdata)',
  enterprise:    'Enterprise apps — the specification is encrypted, so the contents are not public',
  other:         'Container image not recognised, plus git-deployed apps (they all share the runonflux/orbit wrapper)',
};

export const APP_CATEGORY_META = {
  computing:     { label: 'Computing',      Icon: FiCpu,      color: '#6366f1' },
  gaming:        { label: 'Gaming',         Icon: FaGamepad,  color: '#10b981' },
  communication: { label: 'Communication',  Icon: FiLink,     color: '#3b82f6' },
  web:           { label: 'Web / CMS',      Icon: FiBox,      color: '#f59e0b' },
  blockchain:    { label: 'Blockchain',     Icon: FiLink,     color: '#8b5cf6' },
  database:      { label: 'Database',       Icon: FiDatabase, color: '#06b6d4' },
  devops:        { label: 'DevOps / CI',    Icon: FiBox,      color: '#84cc16' },
  media:         { label: 'Media',          Icon: FiZap,      color: '#f43f5e' },
  ai:            { label: 'AI / ML',        Icon: LuBrainCircuit, color: '#a78bfa' },
  vpn:           { label: 'VPN / Privacy',  Icon: FiShield,   color: '#0ea5e9' },
  monitoring:    { label: 'Monitoring',     Icon: FiActivity, color: '#f97316' },
  enterprise:    { label: 'Enterprise',     Icon: FiLock,     color: '#64748b' },
  other:         { label: 'Other',          Icon: FiBox,      color: '#94a3b8' },
};

import { FiCpu, FiDatabase, FiLink, FiBox, FiZap, FiShield, FiActivity } from 'react-icons/fi';
import { FaGamepad } from 'react-icons/fa';
import { LuBrainCircuit } from 'react-icons/lu';

export const CATEGORY_TOOLTIPS = {
  computing:     'Volunteer & distributed computing (Folding@Home, BOINC, Gridcoin)',
  gaming:        'Game servers (Minecraft, Valheim, Factorio, CS:GO)',
  communication: 'Chat & messaging servers (Matrix, Conduit, Mattermost, Jitsi)',
  web:           'Web apps & CMS (WordPress, Nextcloud, Ghost, Nginx)',
  blockchain:    'Blockchain nodes & explorers (Bitcoin, Ethereum, Kaspa, Kadena, Firo)',
  database:      'Database servers (MySQL, PostgreSQL, Redis, MongoDB)',
  devops:        'CI/CD & DevOps tools (Gitea, Jenkins, Woodpecker, Act)',
  media:         'Media servers (Jellyfin, Plex, Navidrome, Emby)',
  ai:            'AI & machine learning workloads (Ollama, LocalAI, ComfyUI)',
  vpn:           'VPN, privacy & decentralised search (Presearch, WireGuard, Shadowsocks)',
  monitoring:    'Observability & monitoring (Grafana, Prometheus, Uptime-Kuma, Netdata)',
  other:         'Other / uncategorized applications',
};

export const APP_CATEGORY_META = {
  computing:     { label: 'Computing',     Icon: FiCpu,      color: '#6366f1' },
  gaming:        { label: 'Gaming',         Icon: FaGamepad,  color: '#10b981' },
  communication: { label: 'Communication', Icon: FiLink,     color: '#3b82f6' },
  web:           { label: 'Web / CMS',     Icon: FiBox,      color: '#f59e0b' },
  blockchain:    { label: 'Blockchain',    Icon: FiLink,     color: '#8b5cf6' },
  database:      { label: 'Database',      Icon: FiDatabase, color: '#06b6d4' },
  devops:        { label: 'DevOps / CI',   Icon: FiBox,      color: '#84cc16' },
  media:         { label: 'Media',         Icon: FiZap,      color: '#f43f5e' },
  ai:            { label: 'AI / ML',       Icon: LuBrainCircuit, color: '#a78bfa' },
  vpn:           { label: 'VPN / Privacy', Icon: FiShield,   color: '#0ea5e9' },
  monitoring:    { label: 'Monitoring',    Icon: FiActivity, color: '#f97316' },
  other:         { label: 'Other',         Icon: FiBox,      color: '#94a3b8' },
};

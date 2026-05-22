const fs = require('fs');
let code = fs.readFileSync('src/lib/piiRules.ts', 'utf8');

code = code.replace(
  'validate?: (value: string) => boolean;',
  'validate?: (value: string) => boolean;\n  negativeContext?: string[];'
);

const proxyServerOld = `  {
    id: 'proxy_server_ip',
    category: 'NETWORK',
    label: 'Proxy Server IP',
    pattern: /(?:^|[\\n\\r])\\s*(?:server|host|endpoint|remote)\\s*:\\s*["']?((?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d))["']?/giud,
    captureGroup: 1,
    mustHaveContext: ['server', 'host', 'endpoint', 'remote', 'proxy', 'mihomo', 'clash', 'http', 'socks'],
    strictContext: false,
  },`;
const proxyServerNew = `  {
    id: 'proxy_server_address',
    category: 'NETWORK',
    label: 'Proxy Server Address',
    pattern: /(?:^|[\\n\\r])\\s*(?:server|host|endpoint|remote)\\s*:\\s*["']?([a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}|\\d{1,3}(?:\\.\\d{1,3}){3})["']?/giud,
    captureGroup: 1,
    mustHaveContext: ['server', 'host', 'endpoint', 'remote', 'proxy', 'mihomo', 'clash', 'http', 'socks', 'vless', 'vmess', 'trojan'],
    strictContext: false,
  },`;
code = code.replace(proxyServerOld.replace(/\r\n/g, '\n'), proxyServerNew);

const ipv4Old = `  {
    id: 'ipv4',
    category: 'NETWORK',
    label: 'IPv4',
    pattern: /\\b((?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d))\\b/gud,
    captureGroup: 1,
    mustHaveContext: ['ip', 'ipv4', 'host', 'server', 'address', 'адрес', 'сервер', 'endpoint', 'node', 'peer', 'remote', 'target'],
  },`;
const ipv4New = `  {
    id: 'ipv4',
    category: 'NETWORK',
    label: 'IPv4',
    pattern: /\\b((?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d))\\b/gud,
    captureGroup: 1,
    mustHaveContext: ['ip', 'ipv4', 'host', 'server', 'address', 'адрес', 'сервер', 'endpoint', 'node', 'peer', 'remote', 'target'],
    negativeContext: ['nameserver', 'dns', 'fallback', 'stun'],
    validate: (ip) => {
      const ignored = new Set(['0.0.0.0', '127.0.0.1', '1.1.1.1', '1.0.0.1', '8.8.8.8', '8.8.4.4', '1.2.3.4']);
      if (ignored.has(ip)) return false;
      if (ip.startsWith('127.')) return false;
      return true;
    },
  },`;
code = code.replace(ipv4Old.replace(/\r\n/g, '\n'), ipv4New);

const destPortOld = `  {
    id: 'reality_dest_port',
    category: 'NETWORK',
    label: 'Dest Port',
    pattern: /(?:dest|port)[\\s:="']+([1-9][0-9]{0,4})["']?/giud,
    captureGroup: 1,
    mustHaveContext: ['dest', 'port', 'reality', 'vless', 'xray'],
    strictContext: false,
  },`;
const destPortNew = `  {
    id: 'reality_dest_port',
    category: 'NETWORK',
    label: 'Dest Port',
    pattern: /(?:dest|(?<![-\\w])port)[\\s:="']+([1-9][0-9]{0,4})["']?/giud,
    captureGroup: 1,
    mustHaveContext: ['dest', 'port', 'reality', 'vless', 'xray'],
    strictContext: false,
  },`;
code = code.replace(destPortOld.replace(/\r\n/g, '\n'), destPortNew);

// Windows newlines normalization just in case
code = code.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

fs.writeFileSync('src/lib/piiRules.ts', code);
console.log('Code modified!');

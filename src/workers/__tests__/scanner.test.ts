import { expect, test, describe } from 'vitest';
import { scanTextForPii } from '../scanner.worker';

describe('scanTextForPii', () => {
  test('returns empty array for safe text', () => {
    const text = 'This is a completely safe text with no PII.';
    const findings = scanTextForPii(text);
    expect(findings).toEqual([]);
  });

  test('extracts PII correctly', () => {
    const text = 'Contact me at admin@gmail.com or server ip 192.168.1.1';
    const findings = scanTextForPii(text);
    
    expect(findings.length).toBeGreaterThanOrEqual(2);
    const rules = findings.map(f => f.ruleId);
    expect(rules).toContain('email');
    expect(rules).toContain('ipv4');
  });

  test('extracts X-ray VLESS Reality configs from JSON', () => {
    const text = `{
      "inbounds": [{
        "streamSettings": {
          "security": "reality",
          "realitySettings": {
            "dest": "9443",
            "shortIds": [
              "b512d4993abcdef0"
            ],
            "publicKey": "nceWGH5IyimW0kLrcdeWGH5IyimW0kLrcdeWGH5Iyim",
            "privateKey": "TSpM2uVvzbgrYFSTSpM2uVvzbgrYFSTSpM2uVvzbgrY",
            "serverNames": [
              "cdn.avoidagain.life"
            ]
          }
        }
      }]
    }`;
    const findings = scanTextForPii(text);
    
    const rules = findings.map(f => f.ruleId);
    expect(rules).toContain('reality_dest_port');
    expect(rules).toContain('reality_short_id');
    expect(rules).toContain('reality_public_key');
    expect(rules).toContain('xray_private_key');
    expect(rules).toContain('reality_server_name');
  });

  test('extracts Proxy Server Address from YAML', () => {
    const text = `
  - name: "🇷🇺 Russia"
    type: vless
    server: cdn-ru-2.2299023.xyz
    port: 443
    network: tcp
    `;
    const findings = scanTextForPii(text);
    
    const rules = findings.map(f => f.ruleId);
    expect(rules).toContain('proxy_server_address');
    expect(rules).toContain('reality_dest_port');
  });

  test('ignores local ports and public DNS IPs in proxy configs', () => {
    const text = `
    mixed-port: 7890
    socks-port: 7891
    redir-port: 7892
    nameserver:
      - https://1.1.1.1/dns-query
      - https://8.8.8.8/dns-query
      - tls://dns.google
      - 185.222.222.222
      - 45.11.45.11
    `;
    const findings = scanTextForPii(text);
    
    const rules = findings.map(f => f.ruleId);
    expect(rules).not.toContain('reality_dest_port');
    expect(rules).not.toContain('ipv4');
  });

  test('ignores already redacted text', () => {
    const text = `
    Proxy Username
    █████████

    Proxy Password
    *********

    Email:
    [EMAIL-1]
    `;
    const findings = scanTextForPii(text);
    
    expect(findings.length).toBe(0);
  });
});

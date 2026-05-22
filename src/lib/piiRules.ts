// Native JavaScript RegExp rules for the Smart Extraction pipeline.
// Every pattern captures only the sensitive value via captureGroup.

export type PiiCategory =
  | 'CONTACT'
  | 'FINANCIAL'
  | 'IDENTITY'
  | 'NETWORK'
  | 'CREDENTIALS';

export interface PiiRule {
  id: string;
  category: PiiCategory;
  label: string;
  pattern: RegExp;
  captureGroup: number;
  mustHaveContext: string[];
  strictContext?: boolean;
  validate?: (value: string) => boolean;
  negativeContext?: string[];
}

function onlyDigits(value: string): string {
  return value.replace(/\D/gu, '');
}

function isLuhnValid(value: string): boolean {
  const digits = onlyDigits(value);
  if (!/^\d{13,19}$/u.test(digits)) return false;
  if (/^(\d)\1+$/u.test(digits)) return false;

  let sum = 0;
  let shouldDouble = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

function isInnValid(value: string): boolean {
  const digits = onlyDigits(value);
  const d = digits.split('').map(Number);

  if (digits.length === 10) {
    const weights = [2, 4, 10, 3, 5, 9, 4, 6, 8];
    const check = weights.reduce((sum, weight, i) => sum + weight * d[i], 0) % 11 % 10;
    return check === d[9];
  }

  if (digits.length === 12) {
    const weights11 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
    const weights12 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
    const check11 = weights11.reduce((sum, weight, i) => sum + weight * d[i], 0) % 11 % 10;
    const check12 = weights12.reduce((sum, weight, i) => sum + weight * d[i], 0) % 11 % 10;
    return check11 === d[10] && check12 === d[11];
  }

  return false;
}

function isSnilsValid(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 11) return false;

  const body = digits.slice(0, 9).split('').map(Number);
  const control = Number(digits.slice(9));
  const sum = body.reduce((acc, digit, i) => acc + digit * (9 - i), 0);

  if (sum < 100) return sum === control;
  if (sum === 100 || sum === 101) return control === 0;
  return (sum % 101) % 100 === control;
}

function looksLikeSecret(value: string): boolean {
  const trimmed = value.trim().replace(/^["']|["']$/gu, '');
  if (trimmed.length < 8) return false;
  if (/^[^\p{L}\p{N}]+$/u.test(trimmed)) return false;
  if (/^(.)\1+$/u.test(trimmed)) return false;

  return (
    /\p{L}/u.test(trimmed) &&
    (/\p{N}/u.test(trimmed) || /[!@#$%^&*()_+=-]/u.test(trimmed) || trimmed.length >= 14)
  );
}

export const PII_RULES: PiiRule[] = [
  {
    id: 'jwt_token',
    category: 'CREDENTIALS',
    label: 'JWT Token',
    pattern: /\b(ey[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+(?:\.[A-Za-z0-9-_.+/=]*)?)/gud,
    captureGroup: 1,
    mustHaveContext: ['session_token', 'session token', 'jwt', 'token', 'authorization', 'bearer'],
  },
  {
    id: 'aws_secret_key',
    category: 'CREDENTIALS',
    label: 'AWS Secret Access Key',
    pattern: /AWS_SECRET_ACCESS_KEY[\s:=]+["']?([A-Za-z0-9/+=_-]{20,60})["']?/giud,
    captureGroup: 1,
    mustHaveContext: ['aws_secret_access_key', 'aws', 'secret'],
  },
  {
    id: 'db_password_in_url',
    category: 'CREDENTIALS',
    label: 'Database Password',
    pattern: /\bpostgres(?:ql)?:\/\/[^:\s/@]+:([^@\s/]{8,})@/giud,
    captureGroup: 1,
    mustHaveContext: ['postgres', 'postgresql', 'database', 'db'],
    validate: looksLikeSecret,
  },
  {
    id: 'proxy_password',
    category: 'CREDENTIALS',
    label: 'Proxy Password',
    pattern: /(?:^|[\n\r])\s*(?:password|passwd|pwd)\s*:\s*["']?([^\s"'#]{4,})["']?/giud,
    captureGroup: 1,
    mustHaveContext: ['password', 'proxy', 'mihomo', 'clash', 'http', 'socks', 'server', 'port', 'username'],
    strictContext: true,
  },
  {
    id: 'proxy_username',
    category: 'CREDENTIALS',
    label: 'Proxy Username',
    pattern: /(?:^|[\n\r])\s*(?:username|user|login)\s*:\s*["']?([^\s"'#]{2,})["']?/giud,
    captureGroup: 1,
    mustHaveContext: ['username', 'user', 'login', 'proxy', 'mihomo', 'clash', 'http', 'socks', 'server', 'port'],
    strictContext: true,
  },
  {
    id: 'generic_password',
    category: 'CREDENTIALS',
    label: 'Generic Password',
    pattern: /(?:password|pasword|пароль|secret|секретное\s+слово)[\p{L}\s-]{0,40}?[:=]\s*["']?([^\s"'.:,]{8,})/giud,
    captureGroup: 1,
    mustHaveContext: [
      'password',
      'пароль',
      'secret',
      'секретное слово',
      'pwd',
      'token',
      'auth_key',
      'hash',
      'credential',
    ],
    validate: looksLikeSecret,
  },
  {
    id: 'uuid_vless_id',
    category: 'CREDENTIALS',
    label: 'UUID / Client ID',
    pattern: /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/giud,
    captureGroup: 1,
    mustHaveContext: ['uuid', 'id', 'client', 'vless', 'vmess', 'trojan', 'user'],
    strictContext: true,
  },
  {
    id: 'wireguard_private_key',
    category: 'CREDENTIALS',
    label: 'Private Key (Base64)',
    pattern: /(?:key|private|secret|token)[\s:=]+["']?([A-Za-z0-9+/]{42,44}=)["']?/giud,
    captureGroup: 1,
    mustHaveContext: ['private', 'key', 'warp', 'amnezia', 'wg', 'wireguard', 'secret'],
  },
  {
    id: 'reality_public_key',
    category: 'CREDENTIALS',
    label: 'Reality Public Key',
    pattern: /(?:public[-_\s]?key|pbk)[\s:=]+["']?([A-Za-z0-9_-]{32,64})["']?/giud,
    captureGroup: 1,
    mustHaveContext: ['reality', 'reality-opts', 'public-key', 'public_key', 'xray', 'vless', 'xtls', 'sing-box'],
    strictContext: true,
  },
  {
    id: 'reality_short_id',
    category: 'CREDENTIALS',
    label: 'Reality Short ID',
    pattern: /(?:short[-_\s]?id|sid)[\s:=\[\],'"-]+([0-9a-f]{2,16})/giud,
    captureGroup: 1,
    mustHaveContext: ['reality', 'reality-opts', 'short-id', 'short_id', 'xray', 'vless', 'xtls', 'sing-box'],
    strictContext: true,
  },
  {
    id: 'yaml_docker_secret',
    category: 'CREDENTIALS',
    label: 'Config Secret',
    pattern: /(?:[A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|AUTH|PWD))[\s:=]+["']?([^\s"']{8,})["']?/giud,
    captureGroup: 1,
    mustHaveContext: ['password', 'secret', 'token', 'env', 'docker', 'compose', 'db', 'root', 'auth', 'cloudflare', 'cf', 'api_token'],
  },
  {
    id: 'ssh_private_key_header',
    category: 'CREDENTIALS',
    label: 'SSH Private Key Block',
    pattern: /(-----BEGIN [A-Z ]+ PRIVATE KEY-----)/gud,
    captureGroup: 1,
    mustHaveContext: ['key', 'ssh', 'rsa', 'openssh', 'private'],
  },
  {
    id: 'email',
    category: 'CONTACT',
    label: 'Email',
    pattern: /([\p{L}\p{N}._%+'’-]+@(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+[\p{L}]{2,63})/giud,
    captureGroup: 1,
    mustHaveContext: ['email', 'e-mail', 'mail', 'почта', 'contact', 'контакт', 'recipient', 'sender', 'smtp', 'account'],
  },
  {
    id: 'phone_ru',
    category: 'CONTACT',
    label: 'Phone (RU)',
    pattern: /(?<!\d)((?:\+7|8)[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2})(?!\d)/gud,
    captureGroup: 1,
    mustHaveContext: ['тел', 'номер', 'phone', 'contact', 'контакт'],
  },
  {
    id: 'phone_us',
    category: 'CONTACT',
    label: 'Phone (US)',
    pattern: /(?<!\d)(\+1[\s.-]?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4})(?!\d)/gud,
    captureGroup: 1,
    mustHaveContext: ['тел', 'номер', 'phone', 'contact', 'контакт'],
  },
  {
    id: 'credit_card',
    category: 'FINANCIAL',
    label: 'Credit Card',
    pattern: /\b((?:\d[ -]?){12,18}\d)\b/gud,
    captureGroup: 1,
    mustHaveContext: ['card', 'credit', 'debit', 'visa', 'mastercard', 'amex', 'карта', 'оплата', 'payment'],
    validate: isLuhnValid,
  },
  {
    id: 'financial_last_4',
    category: 'FINANCIAL',
    label: 'Financial Last 4',
    pattern: /(?:ending\s+in|ends\s+with|last\s*4|last\s+four|оканчивается\s+на|последние\s+4)[\s:#=-]+(\d{4})(?!\d)/giud,
    captureGroup: 1,
    mustHaveContext: ['ending in', 'last 4', 'last four', 'card', 'account', 'оканчивается', 'последние 4'],
  },
  {
    id: 'bank_account',
    category: 'FINANCIAL',
    label: 'Bank Account',
    pattern: /\b(\d{20})\b/gud,
    captureGroup: 1,
    mustHaveContext: ['счет', 'р/с', 'л/с', 'account', 'номер счета', 'расчетный'],
  },
  {
    id: 'routing_number',
    category: 'FINANCIAL',
    label: 'Routing Number',
    pattern: /(?<!\d)(\d{9})(?!\d)/gud,
    captureGroup: 1,
    mustHaveContext: ['routing', 'routing number', 'aba', 'маршрутный номер'],
    strictContext: true,
  },
  {
    id: 'inn_ru',
    category: 'IDENTITY',
    label: 'INN (RU)',
    pattern: /(?<!\d)(\d{10}|\d{12})(?!\d)/gud,
    captureGroup: 1,
    mustHaveContext: ['инн', 'inn', 'налог'],
    strictContext: true,
    validate: isInnValid,
  },
  {
    id: 'identity_name',
    category: 'IDENTITY',
    label: 'Person Name',
    pattern: /(?<![\p{L}])([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+\.?){1,3})(?![\p{L}])/gud,
    captureGroup: 1,
    mustHaveContext: [
      'гражданин',
      'гражданка',
      'фио',
      'директор',
      'представитель',
      'сторона',
      'физическое лицо',
      'покупатель',
      'продавец',
      'арендатор',
      'арендодатель',
      'подписал',
      'в лице',
      'именуемый',
    ],
  },
  {
    id: 'passport_ru',
    category: 'IDENTITY',
    label: 'Passport (RU)',
    pattern: /\b(\d{2}\s?\d{2}\s?\d{6})\b/gud,
    captureGroup: 1,
    mustHaveContext: ['паспорт', 'серия', 'номер', 'выдан', 'код подразделения', 'уфмс', 'мвд'],
  },
  {
    id: 'snils_ru',
    category: 'IDENTITY',
    label: 'SNILS (RU)',
    pattern: /(?<!\d)(\d{3}-\d{3}-\d{3}[ -]\d{2})(?!\d)/gud,
    captureGroup: 1,
    mustHaveContext: ['снилс', 'snils'],
    strictContext: true,
    validate: isSnilsValid,
  },
  {
    id: 'date_of_birth',
    category: 'IDENTITY',
    label: 'Date of Birth',
    pattern: /\b(\d{2}[./-]\d{2}[./-]\d{4})\b/gud,
    captureGroup: 1,
    mustHaveContext: ['рождения', 'родился', 'родилась', 'дата рождения', 'г.р.'],
  },
  {
    id: 'address_ru',
    category: 'CONTACT',
    label: 'Address',
    pattern: /((?:адрес|проживающий|зарегистрирован|регистрации|место\s+жительства)[^\n]{0,160}?(?:г\.|ул\.|пр-т|пер\.|д\.|кв\.)[^\n]{2,160}?)(?=\.\s+(?:Расчетный|Счет|ИНН|СНИЛС|Паспорт|Тел|Email|E-mail|Договор|Сторона)|$|\n)/giud,
    captureGroup: 1,
    mustHaveContext: ['адрес', 'проживающий', 'зарегистрирован', 'регистрации', 'место жительства'],
  },
  {
    id: 'ipv4',
    category: 'NETWORK',
    label: 'IPv4',
    pattern: /\b((?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d))\b/gud,
    captureGroup: 1,
    mustHaveContext: ['ip', 'ipv4', 'host', 'server', 'address', 'адрес', 'сервер', 'endpoint', 'node', 'peer', 'remote', 'target'],
    negativeContext: ['nameserver', 'dns', 'fallback', 'stun'],
    validate: (ip) => {
      const ignored = new Set(['0.0.0.0', '127.0.0.1', '1.1.1.1', '1.0.0.1', '8.8.8.8', '8.8.4.4', '1.2.3.4']);
      if (ignored.has(ip)) return false;
      if (ip.startsWith('127.')) return false;
      return true;
    },
  },
  {
    id: 'proxy_server_address',
    category: 'NETWORK',
    label: 'Proxy Server Address',
    pattern: /(?:^|[\n\r])\s*(?:server|host|endpoint|remote)\s*:\s*["']?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|\d{1,3}(?:\.\d{1,3}){3})["']?/giud,
    captureGroup: 1,
    mustHaveContext: ['server', 'host', 'endpoint', 'remote', 'proxy', 'mihomo', 'clash', 'http', 'socks', 'vless', 'vmess', 'trojan'],
    strictContext: false,
  },
  {
    id: 'reality_server_name',
    category: 'NETWORK',
    label: 'Reality Server Name / SNI',
    pattern: /(?:server[-_\s]?names?|sni)[\s:=\[\],'"-]+([a-z0-9.-]+\.[a-z]{2,})/giud,
    captureGroup: 1,
    mustHaveContext: ['servernames', 'servername', 'sni', 'reality', 'xray', 'tls'],
    strictContext: false,
  },
  {
    id: 'reality_dest_port',
    category: 'NETWORK',
    label: 'Dest Port',
    pattern: /(?:dest|(?<![-\w])port)[\s:="']+([1-9][0-9]{0,4})["']?/giud,
    captureGroup: 1,
    mustHaveContext: ['dest', 'port', 'reality', 'vless', 'xray'],
    strictContext: false,
  },
  {
    id: 'reality_short_id',
    category: 'CREDENTIALS',
    label: 'Reality Short ID',
    pattern: /(?:short[-_\s]?ids?)[\s:=\[\],'"-]+([a-f0-9]{2,16})/giud,
    captureGroup: 1,
    mustHaveContext: ['shortids', 'shortid', 'reality', 'xray'],
    strictContext: false,
  },
  {
    id: 'reality_public_key',
    category: 'CREDENTIALS',
    label: 'Reality Public Key',
    pattern: /(?:public[-_\s]?keys?)[\s:=\[\],'"-]+([A-Za-z0-9_-]{32,64})/giud,
    captureGroup: 1,
    mustHaveContext: ['publickey', 'reality', 'xray'],
    strictContext: false,
  },
  {
    id: 'xray_private_key',
    category: 'CREDENTIALS',
    label: 'Xray Private Key',
    pattern: /(?:private[-_\s]?keys?)[\s:="']+([A-Za-z0-9_-]{42,44}=?)["']?/giud,
    captureGroup: 1,
    mustHaveContext: ['privatekey', 'xray', 'reality'],
    strictContext: false,
  },
  {
    id: 'config_link_vpn',
    category: 'NETWORK',
    label: 'VPN Config Link',
    pattern: /\b((?:vless|vmess|ss|trojan|clash|amnezia):\/\/[^\s"'<>]+)\b/giud,
    captureGroup: 1,
    mustHaveContext: ['link', 'config', 'server', 'proxy', 'subscription', 'url', 'mihomo', 'clash', 'amnezia', 'cloudflare'],
  },
];

export const CATEGORY_LABELS: Record<PiiCategory, string> = {
  CONTACT: 'Contact',
  FINANCIAL: 'Financial',
  IDENTITY: 'Identity',
  NETWORK: 'Network',
  CREDENTIALS: 'Credentials',
};

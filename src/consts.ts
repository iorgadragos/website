export const SITE = {
  name: 'Dragos Iorga',
  title: 'Dragos Iorga — Your whole product team, in one senior engineer',
  description:
    'Senior tech lead delivering software end to end — discovery, architecture, development, AWS, CI/CD, release and support — AI-augmented, with security, tests and docs included.',
  url: 'https://iorgadragos.ro',
  email: 'dragos@iorgadragos.ro',
  location: 'Bucharest, Romania',
};

// Fill in once accounts exist (tracked on the Studio Ops / Marketing boards).
// Placeholder convention: a value containing the exact, upper-case token T-O-D-O is hidden from the site
// (see `isSet`) and fails `npm run check:launch`. Other markers (lower-case, xxxx) are NOT detected.
export const LINKS = {
  calDiscovery: 'https://cal.com/iorgadragos/discovery',
  calMentoring: 'https://cal.com/iorgadragos/mentoring',
  calAdvisory: 'https://cal.com/iorgadragos/advisory',
  linkedin: 'https://www.linkedin.com/in/TODO',
  github: 'https://github.com/iorgadragos',
  substack: 'https://iorgadragos.substack.com',
  sessionize: 'https://sessionize.com/TODO',
  repo: 'https://github.com/iorgadragos/website',
};

export const LEGAL = {
  entity: 'Iorga M Dragos PFA',
  cui: '41829171',
  vat: 'RO41829171',
  regCom: 'TODO-F40/xxxx/yyyy',
  address: 'Bucharest, Romania',
};

export const NAV = [
  { href: '/services/', label: 'Services' },
  { href: '/how-i-work/', label: 'How I work' },
  { href: '/blog/', label: 'Writing' },
  { href: '/speaking/', label: 'Speaking' },
  { href: '/about/', label: 'About' },
];

/** False for placeholders (case-sensitive token, see the convention above), so unfinished values are never rendered. */
export const isSet = (value: string) => !value.includes('TODO');

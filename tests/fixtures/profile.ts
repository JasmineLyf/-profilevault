import { type Payload } from '../../src/core/schema';
export const fixture: Payload = {
  schemaVersion: 2,
  vaultId: '11111111-1111-4111-8111-111111111111',
  revision: 1,
  profiles: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      label: '虚构测试资料',
      person: {
        fullName: '乔云',
        familyName: '乔',
        givenName: '云',
        latinFullName: 'Yun Qiao',
        birthDate: '1994-04-12',
      },
      contact: {
        email: 'qiao.yun@example.test',
        phone: { countryCallingCode: '+1', nationalNumber: '2025550147' },
      },
      address: {
        countryCode: 'CN',
        region: '示例省',
        city: '虚构市',
        district: '演示区',
        line1: '测试路 100 号',
        line2: '演示楼 2 层',
        postalCode: '000000',
      },
      organization: { name: '虚构示例研究室', jobTitle: '测试工程师' },
      links: { website: 'https://profile.example.test' },
      createdAt: '2026-10-18T00:00:00Z',
      updatedAt: '2026-10-18T00:00:00Z',
    },
  ],
  preferences: { defaultProfileId: '22222222-2222-4222-8222-222222222222', autoLockMinutes: 5 },
};

import { describe, expect, it } from 'vitest';
import { isRadioTeduSuperadmin, RADIOTEDU_SUPERADMIN_EMAIL } from './superadmin';

describe('RadioTEDU superadmin policy', () => {
    it('requires the configured identity and the server-issued admin role together', () => {
        expect(isRadioTeduSuperadmin({ id: 'user-1', email: RADIOTEDU_SUPERADMIN_EMAIL, role: 'admin' })).toBe(true);
        expect(isRadioTeduSuperadmin({ id: 'user-1', email: RADIOTEDU_SUPERADMIN_EMAIL, role: 'user' })).toBe(false);
        expect(isRadioTeduSuperadmin({ id: 'user-1', email: 'other@radiotedu', role: 'admin' })).toBe(false);
        expect(isRadioTeduSuperadmin({ id: '', email: RADIOTEDU_SUPERADMIN_EMAIL, role: 'admin' })).toBe(false);
    });
});

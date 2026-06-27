import { describe, expect, it } from 'vitest';
import { RadioTeduCornerLogo } from './BrandCorner';

describe('RadioTeduCornerLogo', () => {
  it('renders an accessible fixed-corner RadioTEDU brand mark', () => {
    const element = RadioTeduCornerLogo();

    expect(element.type).toBe('a');
    expect(element.props.className).toBe('radiotedu-corner-logo');
    expect(element.props['aria-label']).toBe('RadioTEDU');
    expect(element.props.children[0].props.alt).toBe('RadioTEDU');
    expect(element.props.children[1].props.children).toBe('RadioTEDU');
  });
});

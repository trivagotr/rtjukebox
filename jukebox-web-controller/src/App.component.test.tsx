import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { server } from './test/mswServer';

describe('jukebox controller guest entry', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('creates a guest session through the cookie-based HTTP API without storing a token in local storage', async () => {
    let requestBody: unknown;
    let authTransport: string | null = null;
    server.use(
      http.post(/\/api\/v1\/auth\/guest$/, async ({ request }) => {
        requestBody = await request.json();
        authTransport = request.headers.get('x-auth-transport');
        return HttpResponse.json({
          success: true,
          data: {
            user: {
              id: 'guest-1',
              display_name: 'Test Guest',
              is_guest: true,
              total_songs_added: 0,
              role: 'guest',
            },
          },
        }, { status: 201 });
      }),
    );

    const user = userEvent.setup();
    const { container } = render(<App />);
    const nameInput = container.querySelector('.login-card input');
    const quickStartButton = container.querySelector('.login-card button');

    expect(nameInput).not.toBeNull();
    expect(quickStartButton).not.toBeNull();
    await user.type(nameInput as HTMLInputElement, 'Test Guest');
    await user.click(quickStartButton as HTMLButtonElement);

    expect(await screen.findByText('Test Guest')).toBeInTheDocument();
    await waitFor(() => expect(requestBody).toEqual({ display_name: 'Test Guest' }));
    expect(authTransport).toBe('cookie');
    expect(localStorage.getItem('token')).toBeNull();
    expect(JSON.parse(localStorage.getItem('user') || 'null')).toMatchObject({
      id: 'guest-1',
      role: 'guest',
    });
  });

  it('does not create a session when the guest name is empty', async () => {
    const { container } = render(<App />);
    const quickStartButton = container.querySelector('.login-card button');

    fireEvent.click(quickStartButton as HTMLButtonElement);

    expect(localStorage.getItem('token')).toBeNull();
    expect(container.querySelector('.login-card')).toBeInTheDocument();
  });
});

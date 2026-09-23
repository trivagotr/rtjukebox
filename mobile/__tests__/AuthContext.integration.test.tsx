import React from 'react';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button, Text } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { server } from '../mswServer';

function AuthProbe() {
  const { user, isLoading, guestLogin } = useAuth();

  return (
    <>
      <Text>{isLoading ? 'Loading' : user?.display_name ?? 'Signed out'}</Text>
      <Button title="Continue as guest" onPress={() => guestLogin('Test Guest')} />
    </>
  );
}

describe('mobile authentication flow', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    delete axios.defaults.headers.common.Authorization;
  });

  it('creates and persists a guest session through the HTTP API', async () => {
    let requestBody: unknown;
    server.use(
      http.post('http://127.0.0.1:3000/api/v1/auth/guest', async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({
          success: true,
          data: {
            user: {
              id: 'mobile-guest-1',
              email: 'guest@radiotedu.internal',
              display_name: 'Test Guest',
              role: 'guest',
              is_guest: true,
              total_songs_added: 0,
              total_upvotes_received: 0,
            },
            access_token: 'mobile-access-token',
            refresh_token: 'mobile-refresh-token',
          },
        }, { status: 201 });
      }),
    );

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('Signed out')).toBeTruthy());
    fireEvent.press(screen.getByText('Continue as guest'));

    await waitFor(() => expect(screen.getByText('Test Guest')).toBeTruthy());
    expect(requestBody).toEqual({ display_name: 'Test Guest' });
    expect(await AsyncStorage.getItem('access_token')).toBe('mobile-access-token');
    expect(await AsyncStorage.getItem('refresh_token')).toBe('mobile-refresh-token');
  });
});

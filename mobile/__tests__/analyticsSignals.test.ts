import {describe, expect, it} from '@jest/globals';

import {buildAnalyticsSignal} from '../src/services/analyticsService';

describe('analytics signal layer', () => {
  it('builds published GA4 signals for modern Android and jukebox journeys', () => {
    expect(buildAnalyticsSignal('notification_open', {category: 'podcast', deepLink: 'radiotedu://podcasts/latest'})).toEqual({
      name: 'notification_open',
      params: {category: 'podcast', deep_link: 'radiotedu://podcasts/latest'},
    });

    expect(buildAnalyticsSignal('podcast_listen', {contentId: 'pod-7', seconds: 125})).toEqual({
      name: 'podcast_listen',
      params: {content_id: 'pod-7', seconds: 125, minutes: 2},
    });

    expect(buildAnalyticsSignal('car_playback', {source: 'android-auto', mediaId: 'radiotedu-main'})).toEqual({
      name: 'car_playback',
      params: {source: 'android-auto', media_id: 'radiotedu-main'},
    });

    expect(buildAnalyticsSignal('qr_claim', {deviceCode: 'CAFE-01'})).toEqual({
      name: 'qr_claim',
      params: {device_code: 'CAFE-01'},
    });

    expect(buildAnalyticsSignal('jukebox_queue', {deviceCode: 'CAFE-01', queuePosition: 3})).toEqual({
      name: 'jukebox_queue',
      params: {device_code: 'CAFE-01', queue_position: 3},
    });

    expect(buildAnalyticsSignal('game_session', {game: 'quiz', outcome: 'completed'})).toEqual({
      name: 'game_session',
      params: {game: 'quiz', outcome: 'completed'},
    });

    expect(buildAnalyticsSignal('retention', {daysSinceInstall: 7})).toEqual({
      name: 'retention',
      params: {days_since_install: 7},
    });
  });
});

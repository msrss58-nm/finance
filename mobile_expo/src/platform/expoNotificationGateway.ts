// NotificationGateway bound to expo-notifications — LOCAL notifications only.
// This file never calls getDevicePushTokenAsync / getExpoPushTokenAsync or
// any topic API: those are the only paths that reach Firebase/APNs, and their
// manifest/entitlement surface is removed by plugins/withLocalOnlyNotifications.js.

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { causeTypeOf, err, ok } from '../core/result.ts';
import {
  ALL_OWNED_NOTIFICATION_IDS,
  type NotificationGateway,
  type NotificationPermission,
  type NotificationTap,
  type OwnedNotificationId,
} from '../notifications/notificationGateway.ts';

const CHANNEL_ID = 'ff_general';

function isOwned(id: string): id is OwnedNotificationId {
  return (ALL_OWNED_NOTIFICATION_IDS as readonly string[]).includes(id);
}

function mapPermission(p: Notifications.NotificationPermissionsStatus): NotificationPermission {
  if (p.granted) return 'granted';
  return p.status === Notifications.PermissionStatus.UNDETERMINED ? 'undetermined' : 'denied';
}

function toTap(response: Notifications.NotificationResponse): NotificationTap {
  const request = response.notification.request;
  return {
    key: `${request.identifier}|${response.actionIdentifier}|${response.notification.date}`,
    // Data from a notification this app does not own is never trusted.
    data: isOwned(request.identifier) ? request.content.data : null,
  };
}

export function createExpoNotificationGateway(): NotificationGateway {
  return {
    async initialize() {
      try {
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
          }),
        });
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
            name: 'התראות',
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }
        return ok(undefined);
      } catch (e) {
        return err({ kind: 'init', causeType: causeTypeOf(e) });
      }
    },

    async permissionStatus() {
      try {
        return ok(mapPermission(await Notifications.getPermissionsAsync()));
      } catch (e) {
        return err({ kind: 'permission', causeType: causeTypeOf(e) });
      }
    },

    async requestPermission() {
      try {
        const current = await Notifications.getPermissionsAsync();
        if (current.granted) return ok('granted' as const);
        return ok(mapPermission(await Notifications.requestPermissionsAsync()));
      } catch (e) {
        return err({ kind: 'permission', causeType: causeTypeOf(e) });
      }
    },

    async schedule(request) {
      try {
        await Notifications.cancelScheduledNotificationAsync(request.id);
        await Notifications.scheduleNotificationAsync({
          identifier: request.id,
          content: { title: request.title, body: request.body, data: { ffRoute: request.payload.ffRoute } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: request.at, channelId: CHANNEL_ID },
        });
        return ok(undefined);
      } catch (e) {
        return err({ kind: 'schedule', causeType: causeTypeOf(e) });
      }
    },

    async cancel(id) {
      try {
        await Notifications.cancelScheduledNotificationAsync(id);
        return ok(undefined);
      } catch (e) {
        return err({ kind: 'cancel', causeType: causeTypeOf(e) });
      }
    },

    async pendingOwnedIds() {
      try {
        const all = await Notifications.getAllScheduledNotificationsAsync();
        return ok(all.map((n) => n.identifier).filter(isOwned));
      } catch (e) {
        return err({ kind: 'query', causeType: causeTypeOf(e) });
      }
    },

    async launchTap() {
      try {
        const response = await Notifications.getLastNotificationResponseAsync();
        if (response === null) return null;
        // Consumed: a JS reload must not replay the same tap.
        await Notifications.clearLastNotificationResponseAsync();
        return toTap(response);
      } catch {
        return null;
      }
    },

    onTap(listener) {
      const subscription = Notifications.addNotificationResponseReceivedListener((response) => listener(toTap(response)));
      return () => subscription.remove();
    },
  };
}

import { EventEmitter } from 'eventemitter3';

export interface Notification {
  id: string;
  userId: string;
  agentId: string;
  title: string;
  body: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  read: boolean;
  actionUrl?: string;
  createdAt: Date;
}

interface NotifierEvents {
  'notification:created': (notification: Notification) => void;
  'notification:read': (notificationId: string) => void;
}

/**
 * Notifier handles push notifications, in-app notifications, and digest emails.
 */
export class Notifier extends EventEmitter<NotifierEvents> {
  private notifications: Map<string, Notification> = new Map();

  send(
    userId: string,
    agentId: string,
    title: string,
    body: string,
    priority: Notification['priority'] = 'medium',
    actionUrl?: string
  ): Notification {
    const notification: Notification = {
      id: crypto.randomUUID(),
      userId,
      agentId,
      title,
      body,
      priority,
      read: false,
      actionUrl,
      createdAt: new Date(),
    };

    this.notifications.set(notification.id, notification);
    this.emit('notification:created', notification);
    // In production: push notification via FCM/APNs
    return notification;
  }

  markRead(notificationId: string): void {
    const n = this.notifications.get(notificationId);
    if (n) {
      n.read = true;
      this.emit('notification:read', notificationId);
    }
  }

  getUnread(userId: string): Notification[] {
    return Array.from(this.notifications.values())
      .filter((n) => n.userId === userId && !n.read)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  getAll(userId: string, limit = 50): Notification[] {
    return Array.from(this.notifications.values())
      .filter((n) => n.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
}

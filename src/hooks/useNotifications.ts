/**
 * useNotifications Hook - Maneja notificaciones del navegador
 */
import { useEffect } from 'react';

export function useNotifications() {
  useEffect(() => {
    // Pedir permiso para notificaciones si no lo tiene
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  const sendNotification = (title: string, body: string, options?: NotificationOptions) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        ...options
      });
    }
  };

  return { sendNotification };
}

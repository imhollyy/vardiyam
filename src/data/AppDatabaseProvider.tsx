import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import * as SQLite from 'expo-sqlite';
import * as SplashScreen from 'expo-splash-screen';
import type { SQLiteDatabase } from 'expo-sqlite';

import { initializeDatabase } from './database.ts';
import { recoverPendingDatabaseMaintenance } from './backupFiles.ts';
import { retireDatabaseHandle, withDatabaseOperation } from './transactions.ts';

const DATABASE_NAME = 'vardiyam.db';

type DatabaseMaintenance = {
  closeCurrent: () => Promise<void>;
  reopenCurrent: () => Promise<SQLiteDatabase>;
};

type AppDatabaseContextValue = {
  database: SQLiteDatabase | null;
  busy: boolean;
  error: string | null;
  runDatabaseMaintenance: <T>(operation: (database: SQLiteDatabase, maintenance: DatabaseMaintenance) => Promise<T>) => Promise<T>;
};

const AppDatabaseContext = createContext<AppDatabaseContextValue | null>(null);

async function openInitializedDatabase(recover = true): Promise<SQLiteDatabase> {
  if (recover) await recoverPendingDatabaseMaintenance();
  const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
  try {
    await initializeDatabase(database);
    return database;
  } catch (error) {
    await database.closeAsync();
    throw error;
  }
}

export function AppDatabaseProvider({ children }: PropsWithChildren) {
  const [database, setDatabase] = useState<SQLiteDatabase | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const databaseRef = useRef<SQLiteDatabase | null>(null);

  useEffect(() => {
    if (error) void SplashScreen.hideAsync().catch(() => undefined);
  }, [error]);

  useEffect(() => {
    let active = true;
    void openInitializedDatabase().then((opened) => {
      if (!active) {
        void opened.closeAsync();
        return;
      }
      databaseRef.current = opened;
      setDatabase(opened);
      setError(null);
      setBusy(false);
    }).catch(() => {
      if (active) {
        setError('Yerel veritabanı açılamadı. Veriler değiştirilmedi. Uygulamayı yeniden başlatıp tekrar deneyin.');
        setBusy(false);
      }
    });

    return () => {
      active = false;
      const current = databaseRef.current;
      databaseRef.current = null;
      if (current) void current.closeAsync();
    };
  }, []);

  const runDatabaseMaintenance = useCallback(async <T,>(
    operation: (current: SQLiteDatabase, maintenance: DatabaseMaintenance) => Promise<T>,
  ): Promise<T> => {
    const current = databaseRef.current;
    if (!current) throw new Error('Yerel veritabanı hazır değil.');
    setBusy(true);
    setError(null);

    return withDatabaseOperation(current, async () => {
      let active = current;
      let closed = false;
      const closeCurrent = async () => {
        if (closed) return;
        await active.closeAsync();
        retireDatabaseHandle(active);
        databaseRef.current = null;
        closed = true;
      };
      const reopenCurrent = async () => {
        if (!closed) await closeCurrent();
        const opened = await openInitializedDatabase(false);
        active = opened;
        databaseRef.current = opened;
        setDatabase(opened);
        closed = false;
        return opened;
      };

      try {
        return await operation(current, { closeCurrent, reopenCurrent });
      } finally {
        if (closed) {
          try {
            await recoverPendingDatabaseMaintenance();
            await reopenCurrent();
          } catch {
            databaseRef.current = null;
            setDatabase(null);
            setError('Veritabanı yeniden açılamadı. Güvenlik kopyası korunmuş olabilir; uygulamayı kapatıp yeniden açın.');
          }
        }
        setBusy(false);
      }
    });
  }, []);

  const value = useMemo(() => ({ database, busy, error, runDatabaseMaintenance }), [database, busy, error, runDatabaseMaintenance]);

  return (
    <AppDatabaseContext.Provider value={value}>
      {!database ? (
        <View accessibilityRole="progressbar" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          {busy && <ActivityIndicator />}
          <Text accessibilityLiveRegion="polite" style={{ marginTop: 12, textAlign: 'center' }}>
            {error ?? (busy ? 'Yerel veritabanı hazırlanıyor…' : 'Veritabanı kullanılamıyor.')}
          </Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1 }} pointerEvents={busy ? 'none' : 'auto'} accessibilityElementsHidden={busy} importantForAccessibility={busy ? 'no-hide-descendants' : 'auto'}>
            {children}
          </View>
          {busy ? (
            <View accessibilityRole="progressbar" accessibilityViewIsModal style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#00000066', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
              <ActivityIndicator color="#FFFFFF" />
              <Text accessibilityLiveRegion="polite" style={{ color: '#FFFFFF', marginTop: 12, textAlign: 'center' }}>
                {error ?? 'Veriler güvenle işleniyor…'}
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </AppDatabaseContext.Provider>
  );
}

export function useAppDatabase(): SQLiteDatabase {
  const value = useContext(AppDatabaseContext);
  if (!value?.database) throw new Error('useAppDatabase must be used inside AppDatabaseProvider.');
  return value.database;
}

export function useDatabaseMaintenance() {
  const value = useContext(AppDatabaseContext);
  if (!value) throw new Error('useDatabaseMaintenance must be used inside AppDatabaseProvider.');
  return { busy: value.busy, error: value.error, runDatabaseMaintenance: value.runDatabaseMaintenance };
}

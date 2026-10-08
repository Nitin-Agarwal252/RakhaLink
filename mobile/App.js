import { useEffect, useRef, useState } from 'react';
import { Alert, Image, Linking, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Accelerometer } from 'expo-sensors';
import { demoCrashTraces, detectCrashSequence } from './crashDetector.mjs';

const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const PRESETS = [
  { id: 'gnit', label: 'GNIT campus', lat: 22.6951, lng: 88.3788, sample: true },
  { id: 'nh19-durgapur', label: 'NH-19 sample point (Durgapur area)', lat: 23.55, lng: 87.32, sample: true },
];
const CATEGORIES = [
  { id: 'fuel', title: 'Fuel', hint: 'Need fuel', icon: '⛽', color: '#274706', pale: '#EDF2E6' },
  { id: 'breakdown', title: 'Breakdown', hint: 'Vehicle trouble', icon: '🛠', color: '#1B4D4F', pale: '#E6F0F0' },
  { id: 'accident', title: 'Accident', hint: 'Road incident', icon: '⚠', color: '#2B3A67', pale: '#E9ECF4' },
  { id: 'medical', title: 'Medical', hint: 'Medical help', icon: '✚', color: '#5B1F2D', pale: '#F3E9EC' },
];
const MORSE_BITS = [1, 0, 1, 0, 1, 0, 0, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0];
const OFFLINE_QUEUE_KEY = 'rakshalink.offline-queue.v1';

function ActionButton({ title, onPress, disabled, style, textStyle }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.button, style, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
      <Text style={[styles.buttonText, textStyle]}>{title}</Text>
    </Pressable>
  );
}

function BrandHeader() {
  return (
    <View style={styles.brandHeader}>
      <Image accessibilityLabel="RakshaLink" source={require('./assets/rakshalink-logo.png')} resizeMode="contain" style={styles.brandLogo} />
      <Text style={styles.demoBadge}>DEMO</Text>
    </View>
  );
}

export default function App() {
  const alarmPlayer = useAudioPlayer(require('./assets/countdown-alarm.wav'));
  const [preset, setPreset] = useState(PRESETS[0]);
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(null);
  const [crashDeadline, setCrashDeadline] = useState(null);
  const [countdownSeconds, setCountdownSeconds] = useState(null);
  const [crashNotice, setCrashNotice] = useState('');
  const [crashSummary, setCrashSummary] = useState({ peak_g: 8.4, pre_impact_kmh: 72 });
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [offlineQueueReady, setOfflineQueueReady] = useState(false);
  const [offlineView, setOfflineView] = useState(false);
  const [morseOn, setMorseOn] = useState(false);
  const [smsTargets, setSmsTargets] = useState([]);
  const [sensorActive, setSensorActive] = useState(false);
  const [sensorMessage, setSensorMessage] = useState('');
  const sensorSamplesRef = useRef([]);
  const lastLocationRef = useRef(null);

  useEffect(() => {
    AsyncStorage.getItem(OFFLINE_QUEUE_KEY).then(value => {
      if (value) {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          setOfflineQueue(parsed);
          if (parsed.length) setOfflineView(true);
        }
      }
    }).catch(() => {}).finally(() => setOfflineQueueReady(true));
  }, []);

  useEffect(() => {
    if (!offlineQueueReady) return;
    AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(offlineQueue)).catch(() => {});
  }, [offlineQueue, offlineQueueReady]);

  useEffect(() => {
    fetch(`${API_BASE}/api/offline-config`).then(response => response.json()).then(data => {
      if (Array.isArray(data.sms_targets)) {
        const targets = data.demo_mode ? data.sms_targets.filter(value => typeof value === 'string') : [];
        setSmsTargets(targets);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!offlineView) return undefined;
    let index = 0;
    const interval = setInterval(() => {
      setMorseOn(Boolean(MORSE_BITS[index % MORSE_BITS.length]));
      index += 1;
    }, 180);
    return () => { clearInterval(interval); setMorseOn(false); };
  }, [offlineView]);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    let timer;
    const refresh = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/sos/${active.id}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load request status.');
        if (!cancelled) setStatus(data);
      } catch (err) {
        if (!cancelled) setError(`Status connection lost: ${err.message}`);
      } finally {
        if (!cancelled) timer = setTimeout(refresh, 2000);
      }
    };
    refresh();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [active]);

  const stopAlarm = () => {
    alarmPlayer.pause();
    alarmPlayer.seekTo(0).catch(() => {});
  };

  const createSos = async (category, trigger = 'manual', crashSummary = null) => {
    if (trigger !== 'crash_auto' && crashDeadline) {
      setCrashDeadline(null);
      setCountdownSeconds(null);
      stopAlarm();
      setCrashNotice('Crash simulation cancelled.');
    }
    const body = { category, trigger, lat: preset.lat, lng: preset.lng, preset_id: preset.id };
    if (crashSummary) {
      const { lat, lng, ...telemetry } = crashSummary;
      if (Number.isFinite(lat) && Number.isFinite(lng)) Object.assign(body, { lat, lng, preset_id: undefined });
      Object.assign(body, telemetry);
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/api/sos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not send SOS.');
      setStatus(null);
      setActive({ id: data.id, category, dispatchStatus: data.status });
    } catch (err) {
      setError(`${err.message} Check that the API is running at ${API_BASE}.`);
      if (/network|fetch|timeout/i.test(err.message || '')) {
        setOfflineQueue(current => [...current, { id: `${Date.now()}-${current.length}`, body, category, created_at: new Date().toISOString() }]);
        setOfflineView(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const startCrashSimulation = async (summary = { peak_g: 8.4, pre_impact_kmh: 72 }) => {
    setError('');
    setCrashNotice('');
    setSensorActive(false);
    setCrashSummary(summary);
    try {
      await setAudioModeAsync({ playsInSilentMode: true });
      alarmPlayer.loop = 'single';
      alarmPlayer.volume = 0.9;
      alarmPlayer.play();
    } catch {
      setCrashNotice('The alarm could not start on this device. The countdown will continue on screen.');
    }
    setCountdownSeconds(20);
    setCrashDeadline(Date.now() + 20000);
  };

  const cancelCrashSimulation = () => {
    setSensorActive(false);
    setCrashDeadline(null);
    setCountdownSeconds(null);
    stopAlarm();
    setCrashNotice('Crash simulation cancelled. No SOS was sent.');
  };

  const toggleCrashMonitoring = () => {
    if (sensorActive) {
      setSensorActive(false);
      setSensorMessage('Crash monitoring stopped.');
    } else {
      setSensorMessage('Requesting foreground location permission…');
      setSensorActive(true);
    }
  };

  const retryQueued = async () => {
    if (!offlineQueue.length || loading) return;
    setLoading(true);
    setError('');
    try {
      const queued = offlineQueue[0];
      const response = await fetch(`${API_BASE}/api/sos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(queued.body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not send queued request.');
      setOfflineQueue(current => current.slice(1));
      setOfflineView(false);
      setActive({ id: data.id, category: queued.category, dispatchStatus: data.status });
    } catch (err) {
      setError(`Still offline: ${err.message}`);
    } finally { setLoading(false); }
  };

  const discardQueued = () => Alert.alert('Discard offline requests?', 'These local SOS drafts have not been sent.', [
    { text: 'Keep requests', style: 'cancel' },
    { text: 'Discard', style: 'destructive', onPress: () => { setOfflineQueue([]); setOfflineView(false); } },
  ]);

  const openSmsDraft = async () => {
    const target = smsTargets[0];
    const queued = offlineQueue[0];
    if (!target || !queued) return;
    const place = queued.body.preset_id ? `preset ${queued.body.preset_id}` : 'device location';
    const body = `RakshaLink demo SOS: ${queued.category}. ${place}, coordinates ${queued.body.lat}, ${queued.body.lng}. This is a draft; RakshaLink did not send it.`;
    try { await Linking.openURL(`sms:${encodeURIComponent(target)}?body=${encodeURIComponent(body)}`); }
    catch { setError('Could not open the SMS app. The request remains in the local queue.'); }
  };

  useEffect(() => {
    if (!crashDeadline) return undefined;
    const tick = () => {
      const next = Math.max(0, Math.ceil((crashDeadline - Date.now()) / 1000));
      setCountdownSeconds(next);
      if (next === 0) {
        setCrashDeadline(null);
        stopAlarm();
        setCrashNotice('Simulation complete. Sending a demo accident alert.');
        createSos('accident', 'crash_auto', crashSummary);
      }
    };
    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [crashDeadline]);

  useEffect(() => {
    if (!sensorActive) return undefined;
    let cancelled = false;
    let accelSubscription;
    let locationSubscription;
    const stop = message => {
      setSensorActive(false);
      if (message) setSensorMessage(message);
    };
    const start = async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) return stop('Crash monitoring needs foreground location permission for speed context.');
        const available = await Accelerometer.isAvailableAsync();
        if (!available) return stop('This device does not expose an accelerometer. Replay the sample traces instead.');
        sensorSamplesRef.current = [];
        Accelerometer.setUpdateInterval(100);
        locationSubscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 1000, distanceInterval: 0 },
          location => {
            const speed = location.coords.speed;
            const at = Date.now();
            const speedKmh = Number.isFinite(speed) && speed >= 0 ? speed * 3.6 : null;
            lastLocationRef.current = { lat: location.coords.latitude, lng: location.coords.longitude };
            if (speedKmh != null) sensorSamplesRef.current.push({ at_ms: at, speed_kmh: speedKmh, impact_g: 0 });
          },
          reason => setSensorMessage(`Location speed unavailable: ${reason}`),
        );
        if (cancelled) return locationSubscription?.remove();
        accelSubscription = Accelerometer.addListener(({ x, y, z }) => {
          const at = Date.now();
          const magnitude = Math.hypot(x, y, z);
          const impactG = Math.max(0, magnitude - 1);
          sensorSamplesRef.current.push({ at_ms: at, speed_kmh: null, impact_g: impactG });
          sensorSamplesRef.current = sensorSamplesRef.current.filter(sample => at - sample.at_ms <= 6000).slice(-120);
          const signal = detectCrashSequence(sensorSamplesRef.current);
          if (signal) {
            const location = lastLocationRef.current;
            stop('Sensor sequence matched. A 20-second countdown started; tap I’m OK to cancel.');
            startCrashSimulation({ peak_g: signal.peak_g, pre_impact_kmh: signal.pre_impact_kmh, ...location });
          }
        });
        setSensorMessage('Monitoring in foreground for speed context, impact, and a sudden stop. This prototype makes no accuracy claim.');
      } catch (reason) {
        stop(`Could not start crash monitoring: ${reason?.message || 'sensor unavailable'}`);
      }
    };
    start();
    return () => {
      cancelled = true;
      accelSubscription?.remove();
      locationSubscription?.remove();
    };
  }, [sensorActive]);

  const replayCrashTrace = (trace) => {
    const signal = detectCrashSequence(trace);
    if (!signal) {
      setCrashNotice('Trace ignored: the required speed, impact, and sudden-stop sequence was not present. No SOS was sent.');
      return;
    }
    setCrashNotice('DEMO TRACE matched speed, impact, and sudden stop. Starting the 20-second cancellation countdown.');
    startCrashSimulation({ peak_g: signal.peak_g, pre_impact_kmh: signal.pre_impact_kmh });
  };

  const call112 = async () => {
    try {
      await Linking.openURL('tel:112');
    } catch {
      Alert.alert('Call unavailable', 'This device cannot open the phone dialer. Call 112 manually if you need emergency services.');
    }
  };

  if (offlineView && offlineQueue.length) {
    return (
      <SafeAreaView style={[styles.safe, styles.offlineSafe]}>
        <StatusBar barStyle={morseOn ? 'dark-content' : 'light-content'} backgroundColor={morseOn ? '#F7F3DF' : '#111914'} />
        <ScrollView contentContainerStyle={styles.offlineContent}>
          <BrandHeader />
          <Text style={styles.offlineEyebrow}>OFFLINE LADDER · DEMO</Text>
          <Text style={styles.offlineTitle}>Request held in offline queue</Text>
          <Text style={styles.offlineCopy}>Not sent. Retry when connected, or use the available team SMS draft. No responder has accepted. Queue items are stored on this device until retried or removed.</Text>
          <View style={[styles.morseCard, morseOn && styles.morseCardOn]}>
            <Text style={[styles.morseSignal, morseOn && styles.morseSignalOn]}>{morseOn ? 'SOS' : '··· ——— ···'}</Text>
            <Text style={[styles.morseCaption, morseOn && styles.morseSignalOn]}>Screen Morse flash only · does not contact responders</Text>
          </View>
          <Text style={styles.queueLabel}>Offline queue · {offlineQueue.length} {offlineQueue.length === 1 ? 'request' : 'requests'}</Text>
          {offlineQueue.map((item, index) => <Text key={item.id} style={styles.queueItem}>{index + 1}. {CATEGORIES.find(category => category.id === item.category)?.title || 'SOS'} · {item.body.preset_id || 'device location'}</Text>)}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <ActionButton title={loading ? 'Retrying…' : 'Retry queued request'} onPress={retryQueued} disabled={loading} style={styles.retryButton} />
          <ActionButton title={smsTargets.length ? 'Open prefilled team SMS draft' : 'Team SMS unavailable — no whitelist configured'} onPress={openSmsDraft} disabled={!smsTargets.length} style={styles.smsButton} />
          <Text style={styles.smsNote}>{smsTargets.length ? 'The draft is addressed only to a DEMO_MODE whitelisted team number. Review it; nothing is sent automatically.' : 'No approved team SMS destination was provided by the demo server.'}</Text>
          <ActionButton title="Discard offline requests" onPress={discardQueued} style={styles.secondaryButton} textStyle={styles.secondaryButtonText} />
          <ActionButton title="Call 112" onPress={call112} style={styles.callButton} />
          <ActionButton title="Back to home" onPress={() => setOfflineView(false)} style={styles.secondaryButton} textStyle={styles.secondaryButtonText} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (crashDeadline) {
    const peak = Number.isFinite(crashSummary.peak_g) ? `${crashSummary.peak_g.toFixed(1)} g` : 'Unavailable';
    const speed = Number.isFinite(crashSummary.pre_impact_kmh) ? `${Math.round(crashSummary.pre_impact_kmh)} km/h` : 'Unavailable';
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" backgroundColor="#F0EFDF" />
        <ScrollView contentContainerStyle={styles.crashContent}>
          <BrandHeader />
          <Text style={styles.crashEyebrow}>DRIVE MODE · DEMO</Text>
          <Text style={styles.crashTitle}>Crash detected. Are you OK?</Text>
          <View style={styles.countdownPanel} accessibilityLiveRegion="assertive">
            <View style={styles.countdownRing}>
              <Text style={styles.countdownNumber}>{String(countdownSeconds ?? 20)}</Text>
              <Text style={styles.countdownUnit}>seconds</Text>
            </View>
            <Text style={styles.countdownCopy}>If you do not cancel, a demo Accident SOS will be sent when the timer reaches zero.</Text>
          </View>
          <ActionButton title="I’m OK — cancel alert" onPress={cancelCrashSimulation} style={styles.okButton} />
          <View style={styles.readingsCard}>
            <Text style={styles.readingsTitle}>Detection readings · DEMO MODE</Text>
            <View style={styles.readingsRow}>
              <View style={styles.reading}><Text style={styles.readingLabel}>Peak impact</Text><Text style={styles.readingValue}>{peak}</Text></View>
              <View style={styles.reading}><Text style={styles.readingLabel}>Speed before</Text><Text style={styles.readingValue}>{speed}</Text></View>
            </View>
            <Text style={styles.readingsNote}>Prototype heuristic shown for demonstration. It is not validated for real crashes.</Text>
          </View>
          {crashNotice ? <Text style={styles.crashNotice}>{crashNotice}</Text> : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (active) {
    const event = status || {};
    const steps = event.steps || {};
    const unanswered = event.status === 'unanswered' || steps.unanswered;
    const accepted = Boolean(steps.accepted);
    const category = CATEGORIES.find(item => item.id === active.category);
    const timeline = [
      ['Request received', true],
      ['Responder notified', Boolean(steps.notified)],
      ['Responder accepted', accepted],
      ['On the way', Boolean(steps.enroute)],
      ['Arrived', Boolean(steps.arrived)],
      ['Resolved', Boolean(steps.resolved)],
    ];
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" backgroundColor="#F7F8F6" />
        <ScrollView contentContainerStyle={styles.content}>
          <BrandHeader />
          <Text style={styles.eyebrow}>RAKSHALINK · REQUEST STATUS</Text>
          <Text style={styles.title}>Your {category?.title.toLowerCase()} request</Text>
          <View style={styles.statusCard}>
            <Text style={styles.statusHeading}>{unanswered ? 'No responder answered. Call 112.' : accepted ? 'A responder accepted your request.' : 'Request sent. Waiting for a responder to accept.'}</Text>
            <Text style={styles.bodyText}>SIMULATED DISPATCH · DEMO MODE</Text>
            {!accepted && !unanswered ? <Text style={styles.bodyText}>Help is not confirmed until a responder accepts.</Text> : null}
            {accepted && event.responders?.[0] ? <Text style={styles.bodyText}>{event.responders[0].name} · {event.responders[0].type.replace('_', ' ')}</Text> : null}
            {accepted && Number.isFinite(event.responder_eta_minutes) ? <Text style={styles.bodyText}>Responder-entered estimate: {event.responder_eta_minutes} min</Text> : null}
            {event.family_alert?.status === 'simulated' ? <Text style={styles.familyAlert}>SIMULATED FAMILY ALERT · No contact was notified.</Text> : null}
          </View>
          <Text style={styles.sectionTitle}>Request timeline</Text>
          {timeline.map(([label, done], index) => (
            <View key={label} style={styles.timelineRow}>
              <View style={[styles.timelineDot, done && styles.timelineDotDone]} />
              <Text style={[styles.timelineText, done && styles.timelineTextDone]}>{label}</Text>
              {done ? <Text style={styles.doneLabel}>DONE</Text> : null}
            </View>
          ))}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <ActionButton title="Call 112" onPress={call112} style={styles.callButton} />
          <ActionButton title="Back to home" onPress={() => { setActive(null); setStatus(null); setError(''); }} style={styles.secondaryButton} textStyle={styles.secondaryButtonText} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F8F6" />
      <ScrollView contentContainerStyle={styles.content}>
        <BrandHeader />
          <Text style={styles.tagline}>Help, routed to the right hands.</Text>
        <Text style={styles.eyebrow}>RAKSHALINK · HIGHWAY ASSISTANCE</Text>
        <Text style={styles.title}>What do you need?</Text>
        <Text style={styles.subtitle}>Choose the closest match. Your location preset will be shared with the demo service.</Text>

        <View style={styles.locationCard}>
          <View style={styles.locationHeader}>
            <Text style={styles.sectionTitle}>Location preset</Text>
            <Text style={styles.locationPin}>◎</Text>
          </View>
          {PRESETS.map(item => {
            const selected = item.id === preset.id;
            return (
              <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setPreset(item)} style={[styles.presetRow, selected && styles.presetSelected]}>
                <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioInner} /> : null}</View>
                <View style={styles.presetCopy}>
                  <Text style={styles.presetName}>{item.label}</Text>
                  {item.sample ? <Text style={styles.sampleTag}>SAMPLE · DEMO</Text> : null}
                </View>
              </Pressable>
            );
          })}
          <Text style={styles.locationCoords}>{preset.lat.toFixed(4)}, {preset.lng.toFixed(4)}</Text>
          <Text style={styles.attribution}>Responder locations are sample/demo data. © OpenStreetMap contributors</Text>
        </View>

        {offlineQueue.length ? <ActionButton title={`Offline queue · ${offlineQueue.length} request${offlineQueue.length === 1 ? '' : 's'}`} onPress={() => setOfflineView(true)} style={styles.retryButton} /> : null}

        <View style={styles.grid}>
          {CATEGORIES.map(item => (
            <Pressable key={item.id} accessibilityRole="button" disabled={loading} onPress={() => createSos(item.id)} style={({ pressed }) => [styles.categoryCard, { backgroundColor: item.pale, borderColor: item.color }, pressed && styles.pressed, loading && styles.disabled]}>
              <Text style={[styles.categoryIcon, { color: item.color }]}>{item.icon}</Text>
              <Text style={[styles.categoryTitle, { color: item.color }]}>{item.title}</Text>
              <Text style={styles.categoryHint}>{item.hint}</Text>
            </Pressable>
          ))}
        </View>

        {loading ? <Text style={styles.loading}>Sending demo request…</Text> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

        <View style={styles.driveCard}>
            <Text style={styles.driveEyebrow}>DRIVE MODE</Text>
            <Text style={styles.driveTitle}>Crash alert simulation</Text>
            <Text style={styles.bodyText}>Start a 20-second demo countdown with an alarm. An accident SOS sends automatically unless you cancel.</Text>
            <ActionButton title="Simulate crash" onPress={startCrashSimulation} style={styles.simulateButton} />
            <ActionButton title={sensorActive ? 'Stop crash monitoring' : 'Start crash monitoring'} onPress={toggleCrashMonitoring} style={styles.secondaryButton} textStyle={styles.secondaryButtonText} />
            {sensorMessage ? <Text style={styles.bodyText}>{sensorMessage}</Text> : null}
            <Text style={styles.crashEyebrow}>REPLAYED SENSOR TRACES · DEMO DATA</Text>
            <Text style={styles.bodyText}>Trace checks require speed context, impact, and a sudden stop. This build replays sample traces; it does not monitor live sensors.</Text>
            <ActionButton title="Replay single spike — ignore" onPress={() => replayCrashTrace(demoCrashTraces.singleSpike)} style={styles.secondaryButton} textStyle={styles.secondaryButtonText} />
            <ActionButton title="Replay full crash sequence" onPress={() => replayCrashTrace(demoCrashTraces.impactAndSuddenStop)} style={styles.simulateButton} />
        </View>
        {crashNotice ? <Text style={styles.crashNotice}>{crashNotice}</Text> : null}
        <ActionButton title="Call 112" onPress={call112} style={styles.callButton} />
        <Text style={styles.footer}>DEMO MODE · Dispatch is simulated. Call 112 opens the phone dialer only when tapped.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F8F6' },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 36, maxWidth: 560, width: '100%', alignSelf: 'center' },
  brandHeader: { minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 4, marginBottom: 17, borderRadius: 12, backgroundColor: '#0D160D' },
  brandLogo: { width: 230, height: 54 },
  demoBadge: { marginHorizontal: 7, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, borderWidth: 1, borderColor: '#C8A951', backgroundColor: '#FFF2C4', color: '#6D4E0E', fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  tagline: { color: '#657169', fontSize: 13, lineHeight: 18, marginTop: -8, marginBottom: 14 },
  crashContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36, maxWidth: 560, width: '100%', alignSelf: 'center', backgroundColor: '#F0EFDF', flexGrow: 1 },
  eyebrow: { color: '#66746C', fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginBottom: 8 },
  title: { color: '#14271F', fontSize: 29, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: '#59675F', fontSize: 15, lineHeight: 22, marginTop: 7, marginBottom: 18 },
  locationCard: { backgroundColor: '#FFFFFF', borderColor: '#E2E8E3', borderWidth: 1, borderRadius: 18, padding: 15, marginBottom: 16 },
  locationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  sectionTitle: { color: '#23342B', fontSize: 16, fontWeight: '800' },
  locationPin: { color: '#267348', fontSize: 22, fontWeight: '700' },
  presetRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 9, marginTop: 4 },
  presetSelected: { backgroundColor: '#F0F6F2' },
  radio: { height: 19, width: 19, borderRadius: 10, borderWidth: 1.5, borderColor: '#89958D', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  radioSelected: { borderColor: '#267348' },
  radioInner: { height: 9, width: 9, borderRadius: 5, backgroundColor: '#267348' },
  presetCopy: { flex: 1 },
  presetName: { color: '#26372E', fontSize: 14, fontWeight: '700' },
  sampleTag: { color: '#8A5A16', fontSize: 10, fontWeight: '800', letterSpacing: 0.7, marginTop: 3 },
  locationCoords: { color: '#526259', fontSize: 12, marginTop: 8 },
  attribution: { color: '#758078', fontSize: 10, lineHeight: 15, marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  categoryCard: { width: '48%', minHeight: 132, borderRadius: 18, borderWidth: 1, padding: 15, justifyContent: 'center' },
  categoryIcon: { fontSize: 28, marginBottom: 9 },
  categoryTitle: { fontSize: 18, fontWeight: '800' },
  categoryHint: { color: '#637067', fontSize: 12, marginTop: 4 },
  driveCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8E3', borderRadius: 18, padding: 16, marginTop: 17, marginBottom: 14 },
  driveEyebrow: { color: '#66746C', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  driveTitle: { color: '#23342B', fontSize: 17, fontWeight: '800', marginTop: 5, marginBottom: 5 },
  simulateButton: { backgroundColor: '#19385D', marginTop: 13 },
  crashEyebrow: { color: '#69705F', fontSize: 11, fontWeight: '900', letterSpacing: 1.2, marginTop: 3 },
  crashTitle: { color: '#26331F', fontSize: 26, lineHeight: 33, fontWeight: '900', marginTop: 8, marginBottom: 16 },
  countdownPanel: { alignItems: 'center', backgroundColor: '#FBFAF4', borderWidth: 1, borderColor: '#E1DFD3', borderRadius: 18, padding: 22, marginBottom: 14 },
  countdownRing: { width: 190, height: 190, alignItems: 'center', justifyContent: 'center', borderRadius: 95, borderWidth: 9, borderColor: '#204C08', backgroundColor: '#FBFAF4' },
  countdownNumber: { color: '#22331A', fontSize: 58, fontWeight: '900', lineHeight: 66, fontVariant: ['tabular-nums'] },
  countdownUnit: { color: '#74796A', fontSize: 13, marginTop: 1 },
  countdownCopy: { color: '#62685B', fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: 19 },
  okButton: { width: '100%', minHeight: 60, backgroundColor: '#214A08', marginTop: 2, marginBottom: 14, borderRadius: 14 },
  readingsCard: { backgroundColor: '#FBFAF4', borderWidth: 1, borderColor: '#E1DFD3', borderRadius: 16, padding: 15, marginTop: 2 },
  readingsTitle: { color: '#293624', fontSize: 15, fontWeight: '800', marginBottom: 10 },
  readingsRow: { flexDirection: 'row', gap: 9 },
  reading: { flex: 1, backgroundColor: '#F1F0E8', borderRadius: 10, padding: 11 },
  readingLabel: { color: '#74796A', fontSize: 11 },
  readingValue: { color: '#293624', fontSize: 16, fontWeight: '800', marginTop: 4 },
  readingsNote: { color: '#74796A', fontSize: 11, lineHeight: 17, marginTop: 12 },
  crashNotice: { color: '#66746C', textAlign: 'center', fontSize: 12, marginBottom: 8 },
  bodyText: { color: '#657169', fontSize: 13, lineHeight: 19, marginTop: 5 },
  button: { alignItems: 'center', justifyContent: 'center', borderRadius: 15, minHeight: 56, paddingHorizontal: 18 },
  buttonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  callButton: { backgroundColor: '#BA1A1A', marginTop: 4 },
  secondaryButton: { backgroundColor: '#E8EEE9', marginTop: 20 },
  secondaryButtonText: { color: '#26372E' },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.52 },
  loading: { color: '#43544A', marginTop: 12, fontSize: 14, textAlign: 'center' },
  error: { color: '#9B2525', backgroundColor: '#FCEDED', borderRadius: 10, padding: 12, marginTop: 12, lineHeight: 19 },
  footer: { color: '#758078', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 10 },
  statusCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCE5DE', borderRadius: 18, padding: 18, marginTop: 20, marginBottom: 20 },
  statusHeading: { color: '#21352A', fontSize: 19, lineHeight: 26, fontWeight: '800' },
  familyAlert: { marginTop: 10, padding: 10, borderRadius: 8, backgroundColor: '#FFF5DC', color: '#725B24', fontSize: 12, lineHeight: 18, fontWeight: '700' },
  timelineRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderBottomColor: '#E7EBE8', borderBottomWidth: 1 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#AAB4AD', marginRight: 12 },
  timelineDotDone: { backgroundColor: '#267348', borderColor: '#267348' },
  timelineText: { color: '#7A857D', fontSize: 14, flex: 1 },
  timelineTextDone: { color: '#26372E', fontWeight: '700' },
  doneLabel: { color: '#267348', fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  offlineSafe: { backgroundColor: '#111914' },
  offlineContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 36, maxWidth: 560, width: '100%', alignSelf: 'center' },
  offlineEyebrow: { color: '#D9B25C', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  offlineTitle: { color: '#FFFFFF', fontSize: 27, fontWeight: '900', marginTop: 8 },
  offlineCopy: { color: '#D2D9D3', fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 16 },
  morseCard: { minHeight: 150, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#29312B', padding: 16, marginBottom: 18 },
  morseCardOn: { backgroundColor: '#F7F3DF' },
  morseSignal: { color: '#FFFFFF', fontSize: 31, fontWeight: '900', letterSpacing: 3 },
  morseSignalOn: { color: '#1B2B20' },
  morseCaption: { color: '#E0E6E1', fontSize: 11, textAlign: 'center', marginTop: 10 },
  queueLabel: { color: '#F4D895', fontSize: 14, fontWeight: '800', marginBottom: 7 },
  queueItem: { color: '#FFFFFF', fontSize: 13, paddingVertical: 5 },
  retryButton: { backgroundColor: '#245740', marginTop: 12 },
  smsButton: { backgroundColor: '#3D2A5C', marginTop: 10 },
  smsNote: { color: '#C7D0C9', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 7, marginBottom: 11 },
});

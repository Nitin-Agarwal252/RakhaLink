import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';

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

function ActionButton({ title, onPress, disabled, style, textStyle }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.button, style, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
      <Text style={[styles.buttonText, textStyle]}>{title}</Text>
    </Pressable>
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
    setLoading(true);
    setError('');
    try {
      const body = { category, trigger, lat: preset.lat, lng: preset.lng, preset_id: preset.id };
      if (crashSummary) Object.assign(body, crashSummary);
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
    } finally {
      setLoading(false);
    }
  };

  const startCrashSimulation = async () => {
    setError('');
    setCrashNotice('');
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
    setCrashDeadline(null);
    setCountdownSeconds(null);
    stopAlarm();
    setCrashNotice('Crash simulation cancelled. No SOS was sent.');
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
        createSos('accident', 'crash_auto', { peak_g: 8.4, pre_impact_kmh: 72 });
      }
    };
    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [crashDeadline]);

  const call112 = async () => {
    try {
      await Linking.openURL('tel:112');
    } catch {
      Alert.alert('Call unavailable', 'This device cannot open the phone dialer. Call 112 manually if you need emergency services.');
    }
  };

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
          <Text style={styles.eyebrow}>RAKSHALINK · REQUEST STATUS</Text>
          <Text style={styles.title}>Your {category?.title.toLowerCase()} request</Text>
          <View style={styles.statusCard}>
            <Text style={styles.statusHeading}>{unanswered ? 'No responder answered. Call 112.' : accepted ? 'A responder accepted your request.' : 'Request sent. Waiting for a responder to accept.'}</Text>
            <Text style={styles.bodyText}>SIMULATED DISPATCH · DEMO MODE</Text>
            {!accepted && !unanswered ? <Text style={styles.bodyText}>Help is not confirmed until a responder accepts.</Text> : null}
            {accepted && event.responders?.[0] ? <Text style={styles.bodyText}>{event.responders[0].name} · {event.responders[0].type.replace('_', ' ')}</Text> : null}
            {accepted && Number.isFinite(event.responder_eta_minutes) ? <Text style={styles.bodyText}>Responder estimate: {event.responder_eta_minutes} min</Text> : null}
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

        {crashDeadline ? (
          <View style={styles.crashCard} accessibilityLiveRegion="assertive">
            <Text style={styles.crashEyebrow}>SIMULATE CRASH · DEMO DATA</Text>
            <Text style={styles.crashTitle}>Are you okay?</Text>
            <Text style={styles.countdownNumber}>{String(countdownSeconds ?? 20)}</Text>
            <Text style={styles.bodyText}>Alarm sounding. A demo accident SOS sends automatically when the countdown ends.</Text>
            <ActionButton title="I’m OK — cancel alert" onPress={cancelCrashSimulation} style={styles.okButton} />
          </View>
        ) : (
          <View style={styles.driveCard}>
            <Text style={styles.driveEyebrow}>DRIVE MODE</Text>
            <Text style={styles.driveTitle}>Crash alert simulation</Text>
            <Text style={styles.bodyText}>Start a 20-second demo countdown with an alarm. An accident SOS sends automatically unless you cancel.</Text>
            <ActionButton title="Simulate crash" onPress={startCrashSimulation} style={styles.simulateButton} />
          </View>
        )}
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
  crashCard: { alignItems: 'center', backgroundColor: '#FFF8EE', borderWidth: 2, borderColor: '#C93636', borderRadius: 18, padding: 18, marginTop: 17, marginBottom: 14 },
  crashEyebrow: { color: '#9B3030', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  crashTitle: { color: '#4A2525', fontSize: 23, fontWeight: '900', marginTop: 9 },
  countdownNumber: { color: '#A52424', fontSize: 64, fontWeight: '900', lineHeight: 76, fontVariant: ['tabular-nums'] },
  okButton: { width: '100%', minHeight: 66, backgroundColor: '#267348', marginTop: 16 },
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
  timelineRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderBottomColor: '#E7EBE8', borderBottomWidth: 1 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#AAB4AD', marginRight: 12 },
  timelineDotDone: { backgroundColor: '#267348', borderColor: '#267348' },
  timelineText: { color: '#7A857D', fontSize: 14, flex: 1 },
  timelineTextDone: { color: '#26372E', fontWeight: '700' },
  doneLabel: { color: '#267348', fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
});

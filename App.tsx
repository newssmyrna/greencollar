import React, { useState } from 'react';
import {
  SafeAreaView, ScrollView, View, Text, TextInput,
  Pressable, StyleSheet, StatusBar
} from 'react-native';

type Customer = {
  id: number;
  name: string;
  address: string;
  service: string;
  rate: number;
  minutes: number;
  notes: string;
};

const seed: Customer[] = [
  { id: 1, name: 'Jordan Smith', address: 'Edgewater, FL', service: 'Exterior maintenance', rate: 65, minutes: 45, notes: 'Close side gate.' },
  { id: 2, name: 'Morgan Davis', address: 'New Smyrna Beach, FL', service: 'Pool service', rate: 80, minutes: 35, notes: 'Call before arrival.' },
  { id: 3, name: 'Casey Johnson', address: 'Port Orange, FL', service: 'Cleaning', rate: 110, minutes: 90, notes: 'Use rear entrance.' },
];
const green = '#183d2b';
const pale = '#d5f48b';

export default function App() {
  const [tab, setTab] = useState<'today' | 'customers' | 'planner'>('today');
  const [customers, setCustomers] = useState<Customer[]>(seed);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [hours, setHours] = useState('8');
  const [maxJobs, setMaxJobs] = useState('6');
  const [planned, setPlanned] = useState(false);

  function addCustomer() {
    if (!name.trim() || !address.trim()) return;
    setCustomers(prev => [...prev, {
      id: Date.now(), name: name.trim(), address: address.trim(),
      service: 'General service', rate: 0, minutes: 60, notes: ''
    }]);
    setName(''); setAddress('');
  }
  const visible = customers.slice(0, Math.max(0, parseInt(maxJobs, 10) || 0));
  const estimatedMinutes = visible.reduce((total, c) => total + c.minutes, 0);

  return (
    <SafeAreaView style={styles.page}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.logo}>greencollar.</Text>
        <Text style={styles.subtitle}>Your business. On autopilot.</Text>
        <View style={styles.tabs}>
          {(['today', 'customers', 'planner'] as const).map(t => (
            <Pressable key={t} style={[styles.tab, tab === t && styles.activeTab]} onPress={() => setTab(t)}>
              <Text style={[styles.tabText, tab === t && styles.activeTabText]}>{t.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>

        {tab === 'today' && <>
          <Text style={styles.heading}>Today's overview</Text>
          <Text style={styles.muted}>Synthetic development data — not a live schedule</Text>
          <View style={styles.card}>
            <Text style={styles.label}>Example customers</Text>
            <Text style={styles.big}>{customers.length}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.label}>Next development milestone</Text>
            <Text style={styles.body}>Connected customer records, real constraints, road routing, and a live job workflow.</Text>
          </View>
        </>}

        {tab === 'customers' && <>
          <Text style={styles.heading}>Customers</Text>
          {customers.map(c => <View key={c.id} style={styles.card}>
            <Text style={styles.cardHeading}>{c.name}</Text>
            <Text style={styles.muted}>{c.address} · {c.service}</Text>
            <Text style={styles.body}>Rate ${c.rate} · Estimated {c.minutes} min</Text>
            {!!c.notes && <Text style={styles.label}>Reminder: {c.notes}</Text>}
          </View>)}
          <Text style={styles.heading}>Add example customer</Text>
          <TextInput style={styles.input} placeholder="Customer name" placeholderTextColor="#819b8b" value={name} onChangeText={setName} />
          <TextInput style={styles.input} placeholder="Service address" placeholderTextColor="#819b8b" value={address} onChangeText={setAddress} />
          <Pressable style={styles.primary} onPress={addCustomer}><Text style={styles.primaryText}>Add customer</Text></Pressable>
          <Text style={styles.muted}>Prototype data is in memory only. A secure database is next.</Text>
        </>}

        {tab === 'planner' && <>
          <Text style={styles.heading}>Plan your day</Text>
          <Text style={styles.label}>Hours available</Text>
          <TextInput keyboardType="numeric" style={styles.input} value={hours} onChangeText={v => { setHours(v); setPlanned(false); }} />
          <Text style={styles.label}>Maximum jobs</Text>
          <TextInput keyboardType="numeric" style={styles.input} value={maxJobs} onChangeText={v => { setMaxJobs(v); setPlanned(false); }} />
          <Pressable style={styles.primary} onPress={() => setPlanned(true)}><Text style={styles.primaryText}>Preview workload</Text></Pressable>
          {planned && <View style={styles.card}>
            <Text style={styles.cardHeading}>Workload preview</Text>
            <Text style={styles.body}>{visible.length} example jobs · {estimatedMinutes} min service time</Text>
            <Text style={styles.muted}>Available: {hours || '0'} hours. This is NOT an optimized route: road travel, scheduling constraints, and fuel are not yet connected.</Text>
          </View>}
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0e261b' },
  content: { padding: 20, paddingBottom: 50, gap: 12, maxWidth: 680, width: '100%', alignSelf: 'center' },
  logo: { color: pale, fontSize: 34, fontWeight: '900', marginTop: 14 },
  subtitle: { color: '#c4d9cc', fontSize: 14, marginBottom: 12 },
  tabs: { flexDirection: 'row', backgroundColor: '#193c2c', borderRadius: 12, padding: 5, marginBottom: 8 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 9 },
  activeTab: { backgroundColor: pale },
  tabText: { color: '#c4d9cc', fontSize: 11, fontWeight: '800' },
  activeTabText: { color: green },
  heading: { color: '#fff', fontSize: 21, fontWeight: '800', marginTop: 7 },
  card: { padding: 16, backgroundColor: '#1a3c2b', borderRadius: 14, gap: 7 },
  cardHeading: { color: '#fff', fontSize: 17, fontWeight: '700' },
  big: { color: pale, fontSize: 34, fontWeight: '900' },
  muted: { color: '#a9c2b2', lineHeight: 20, fontSize: 13 },
  body: { color: '#f0f5ef', fontSize: 14, lineHeight: 21 },
  label: { color: '#c4d9cc', fontSize: 13, fontWeight: '600' },
  input: { color: '#fff', borderWidth: 1, borderColor: '#547562', backgroundColor: '#173826', padding: 14, borderRadius: 10 },
  primary: { backgroundColor: pale, padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 5 },
  primaryText: { color: green, fontWeight: '800' },
});

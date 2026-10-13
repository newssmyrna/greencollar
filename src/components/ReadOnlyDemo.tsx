import React, { useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';

type Tab = 'Today' | 'Customers' | 'Planner' | 'Invoices';

const sampleStops = [
  { time: '8:30 AM', name: 'Jordan Smith', service: 'Exterior maintenance', area: 'Edgewater', status: 'Ready' },
  { time: '10:00 AM', name: 'Morgan Davis', service: 'Pool service', area: 'New Smyrna Beach', status: 'Ready' },
  { time: '12:15 PM', name: 'Casey Johnson', service: 'Property cleanup', area: 'Port Orange', status: 'Ready' },
];

export function ReadOnlyDemo({ onExit }: { onExit: () => void }) {
  const [tab, setTab] = useState<Tab>('Today');
  return <SafeAreaView style={s.page}>
    <View style={s.top}>
      <View><Text style={s.brand}>greencollar.</Text><Text style={s.kicker}>FIELD OPERATIONS · SAMPLE WORKSPACE</Text></View>
      <Pressable accessibilityRole="button" onPress={onExit} style={s.exit}><Text style={s.exitText}>Exit demo</Text></Pressable>
    </View>
    <View style={s.banner}><Text style={s.bannerTitle}>Read-only demo</Text><Text style={s.bannerCopy}>Fictional sample data · Nothing here is saved or sent to customers.</Text></View>
    <View style={s.tabs}>{(['Today','Customers','Planner','Invoices'] as Tab[]).map(item=><Pressable key={item} accessibilityRole="tab" accessibilityState={{selected:tab===item}} onPress={()=>setTab(item)} style={[s.tab,tab===item&&s.tabActive]}><Text style={[s.tabText,tab===item&&s.tabTextActive]}>{item}</Text></Pressable>)}</View>
    <ScrollView contentContainerStyle={s.content}>
      {tab==='Today'&&<>
        <Text style={s.eyebrow}>MONDAY · SAMPLE DAY</Text><Text style={s.title}>Good morning</Text><Text style={s.sub}>Your workday at a glance.</Text>
        <View style={s.stats}><View style={s.stat}><Text style={s.statNum}>3</Text><Text style={s.statLabel}>STOPS</Text></View><View style={s.stat}><Text style={s.statNum}>2h 50m</Text><Text style={s.statLabel}>SERVICE TIME</Text></View><View style={s.stat}><Text style={s.statNum}>$255</Text><Text style={s.statLabel}>PLANNED</Text></View></View>
        <View style={s.sectionHead}><Text style={s.sectionTitle}>Today's route</Text><Text style={s.badge}>DRAFT PREVIEW</Text></View>
        {sampleStops.map((stop,i)=><View key={stop.name} style={s.stop}><View style={s.timeline}><View style={s.dot}/>{i<sampleStops.length-1&&<View style={s.line}/>}</View><View style={s.stopBody}><Text style={s.time}>{stop.time}</Text><Text style={s.stopName}>{stop.name}</Text><Text style={s.detail}>{stop.service} · {stop.area}</Text><Text style={s.status}>{stop.status}</Text></View></View>)}
        <Text style={s.note}>Travel time, live traffic, GPS arrival and customer notifications are not active in this demo.</Text>
      </>}
      {tab==='Customers'&&<><Text style={s.eyebrow}>SAMPLE RECORDS</Text><Text style={s.title}>Customers</Text><Text style={s.sub}>Example profiles for visual review only.</Text>{sampleStops.map((c,i)=><View key={c.name} style={s.card}><Text style={s.stopName}>{c.name}</Text><Text style={s.detail}>{c.area} · {c.service}</Text><Text style={s.detail}>Example rate · ${[65,80,110][i]} / visit</Text></View>)}</>}
      {tab==='Planner'&&<><Text style={s.eyebrow}>WORKLOAD PREVIEW</Text><Text style={s.title}>Plan your day</Text><Text style={s.sub}>A sample capacity view. No schedule can be changed here.</Text><View style={s.card}><Text style={s.sectionTitle}>3 example jobs</Text><Text style={s.detail}>170 estimated service minutes</Text><View style={s.progress}><View style={s.progressFill}/></View><Text style={s.detail}>Fits within a sample 6-hour workday</Text></View><Text style={s.note}>Travel, breaks, time windows and route feasibility are not calculated.</Text></>}
      {tab==='Invoices'&&<><Text style={s.eyebrow}>NOT ISSUED</Text><Text style={s.title}>Invoice preview</Text><Text style={s.sub}>Example totals only. Nothing is sent or charged.</Text>{sampleStops.map((c,i)=><View key={c.name} style={s.card}><Text style={s.stopName}>{c.name}</Text><Text style={s.detail}>{c.service}</Text><Text style={s.amount}>${[65,80,110][i]}.00</Text><Text style={s.badge}>SAMPLE · NOT AN INVOICE</Text></View>)}</>}
      <Text style={s.footer}>GREEN COLLAR · DEMO MODE</Text>
    </ScrollView>
  </SafeAreaView>;
}

const s=StyleSheet.create({
 page:{flex:1,backgroundColor:'#0e261b'},top:{paddingHorizontal:20,paddingTop:18,paddingBottom:16,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},brand:{color:'#d5f48b',fontWeight:'900',fontSize:26},kicker:{color:'#a9c2b2',fontSize:9,fontWeight:'800',letterSpacing:1.2,marginTop:4},exit:{borderWidth:1,borderColor:'#547562',paddingVertical:9,paddingHorizontal:12,borderRadius:9},exitText:{color:'#f0f5ef',fontWeight:'700',fontSize:12},banner:{marginHorizontal:16,backgroundColor:'#294a35',borderColor:'#78964f',borderWidth:1,borderRadius:12,padding:13,gap:3},bannerTitle:{color:'#d5f48b',fontWeight:'800',fontSize:14},bannerCopy:{color:'#d0dfd3',fontSize:12,lineHeight:17},tabs:{flexDirection:'row',backgroundColor:'#193c2c',margin:16,marginBottom:4,borderRadius:12,padding:5},tab:{flex:1,alignItems:'center',paddingVertical:11,borderRadius:9},tabActive:{backgroundColor:'#d5f48b'},tabText:{color:'#c4d9cc',fontWeight:'800',fontSize:12},tabTextActive:{color:'#183d2b'},content:{padding:20,paddingTop:14,paddingBottom:40,gap:12,maxWidth:700,width:'100%',alignSelf:'center'},eyebrow:{color:'#d5f48b',fontSize:10,fontWeight:'900',letterSpacing:1.5,marginTop:6},title:{color:'#fff',fontSize:28,fontWeight:'900'},sub:{color:'#a9c2b2',fontSize:14,lineHeight:20,marginTop:-7},stats:{flexDirection:'row',gap:8,marginVertical:6},stat:{flex:1,backgroundColor:'#1a3c2b',padding:13,borderRadius:12,gap:5},statNum:{color:'#d5f48b',fontWeight:'900',fontSize:20},statLabel:{color:'#a9c2b2',fontSize:9,fontWeight:'800',letterSpacing:1},sectionHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:8},sectionTitle:{color:'#fff',fontSize:18,fontWeight:'800'},badge:{color:'#d5f48b',fontSize:9,fontWeight:'900',letterSpacing:1},stop:{flexDirection:'row',minHeight:94},timeline:{width:22,alignItems:'center'},dot:{width:10,height:10,borderRadius:5,backgroundColor:'#d5f48b',marginTop:5},line:{flex:1,width:2,backgroundColor:'#547562',marginVertical:4},stopBody:{flex:1,backgroundColor:'#1a3c2b',padding:13,borderRadius:12,marginBottom:8,gap:3},time:{color:'#d5f48b',fontSize:11,fontWeight:'800'},stopName:{color:'#fff',fontSize:16,fontWeight:'800'},detail:{color:'#b9cbbf',fontSize:12,lineHeight:18},status:{color:'#d5f48b',fontSize:10,fontWeight:'800',marginTop:2},note:{color:'#a9c2b2',fontSize:12,lineHeight:18,backgroundColor:'#173826',padding:12,borderRadius:10,marginTop:3},card:{backgroundColor:'#1a3c2b',padding:16,borderRadius:13,gap:6},amount:{color:'#d5f48b',fontSize:20,fontWeight:'900'},progress:{height:8,backgroundColor:'#355b42',borderRadius:8,overflow:'hidden',marginVertical:7},progressFill:{width:'58%',height:8,backgroundColor:'#d5f48b'},footer:{color:'#668270',fontSize:9,fontWeight:'900',letterSpacing:1.4,textAlign:'center',marginTop:18}
});

export function DemoEntryOnly() {
  const [open, setOpen] = useState(false);
  if (open) return <ReadOnlyDemo onExit={() => setOpen(false)} />;
  return <SafeAreaView style={[s.page,{justifyContent:'center',padding:24}]}>
    <Text style={s.brand}>greencollar.</Text>
    <Text style={[s.sub,{marginTop:8}]}>Your business. On autopilot.</Text>
    <View style={[s.banner,{marginHorizontal:0,marginTop:24}]}>
      <Text style={s.bannerTitle}>Preview mode</Text>
      <Text style={s.bannerCopy}>Clerk is not configured in this preview. Explore the interface with fictional sample data.</Text>
    </View>
    <Pressable accessibilityRole="button" style={[s.tabActive,{padding:16,borderRadius:10,alignItems:'center',marginTop:18}]} onPress={()=>setOpen(true)}>
      <Text style={[s.tabTextActive,{fontSize:14}]}>Explore read-only demo</Text>
    </Pressable>
    <Text style={[s.note,{marginTop:12}]}>Demo only. Nothing is saved, sent to customers, or connected to a real business.</Text>
  </SafeAreaView>;
}

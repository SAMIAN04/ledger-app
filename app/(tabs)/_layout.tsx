// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import FloatingTabBar from '@/components/navigation/FloatingTabBar';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // hide the default tab bar background
        tabBarStyle: { display: 'none' },
      }}
    >
      <Tabs.Screen name="home"         options={{ title: 'Home' }} />
      <Tabs.Screen name="transactions" options={{ title: 'Transactions' }} />
      <Tabs.Screen name="analytics"    options={{ title: 'Analytics' }} />
      <Tabs.Screen name="profile"      options={{ title: 'Profile' }} />
    </Tabs>
  );
}
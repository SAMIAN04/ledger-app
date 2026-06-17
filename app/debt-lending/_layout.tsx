// app/debt-lending/_layout.tsx
import { Stack } from 'expo-router';

export default function DebtLendingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="create-profile" />
      <Stack.Screen name="edit-profile" />
      <Stack.Screen name="profile-detail" />
      <Stack.Screen name="add-transaction" />
    </Stack>
  );
}

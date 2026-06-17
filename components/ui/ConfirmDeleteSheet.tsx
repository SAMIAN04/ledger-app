// components/ui/ConfirmDeleteSheet.tsx
//
// Standalone "are you sure?" bottom sheet — same visual language as the
// confirm-delete card inside TxDetailModal (warning icon, highlighted action
// summary, explanation, bullet list of what will change, Cancel / Confirm).
//
// Unlike TxDetailModal's confirm card (which lives inside an already-open
// detail sheet), this is a fully standalone <Modal/> so it can be triggered
// from any screen — profile deletion, wallet deletion, profile-transaction
// deletion, etc. — giving every destructive action the same "what's about to
// change" preview.

import React, { useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable,
  TouchableOpacity, Animated, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlowOrb } from '@/components/ui/GlassModal';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOW } from '@/constants/theme';

interface Props {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** Big bold title — defaults to "Delete permanently?" */
  title?: string;
  /** Short, bold "what happens" line — e.g. "৳5,000 will be added back to Cash" */
  actionSummary?: string;
  /** Longer explanation paragraph */
  detail?: string;
  /** "What will change" bullet list */
  bullets?: string[];
  /** Label for the confirm button — defaults to "Confirm Delete" */
  confirmLabel?: string;
  /** Emoji shown in the warning icon circle — defaults to ⚠️ */
  icon?: string;
  /** Disables both buttons + shows a spinner on Confirm */
  loading?: boolean;
}

export function ConfirmDeleteSheet({
  visible, onCancel, onConfirm,
  title = 'Delete permanently?',
  actionSummary, detail, bullets,
  confirmLabel = 'Confirm Delete',
  icon = '⚠️',
  loading = false,
}: Props) {
  const slideY  = useRef(new Animated.Value(300)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) {
      slideY.setValue(300); opacity.setValue(0);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(slideY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 200, mass: 0.9 }),
      ]).start();
    }
  }, [visible]);

  return (
    <Modal transparent visible={visible} onRequestClose={onCancel} statusBarTranslucent animationType="none">
      <Pressable style={s.overlay} onPress={onCancel}>
        <Animated.View style={[s.sheet, { opacity, transform: [{ translateY: slideY }] }]}>
          <Pressable>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.sheet }]} />
            <View style={{ position: 'absolute', top: -50, right: -50, alignItems: 'center', justifyContent: 'center' }}>
              <GlowOrb color="#ef4444" size={160} />
            </View>
            <View style={s.handle} />

            <View style={s.confirmCard}>
              <View style={s.confirmIconRow}>
                <View style={s.confirmIconCircle}>
                  <Text style={s.confirmIconEmoji}>{icon}</Text>
                </View>
                <Text style={s.confirmTitle}>{title}</Text>
              </View>

              {!!actionSummary && (
                <Text style={s.confirmAction}>
                  <Text style={s.confirmHighlight}>{actionSummary}</Text>
                </Text>
              )}
              {!!detail && <Text style={s.confirmDetail}>{detail}</Text>}

              {!!bullets?.length && (
                <View style={s.confirmBullets}>
                  {bullets.map((b, i) => (
                    <Text key={i} style={s.confirmBullet}>• {b}</Text>
                  ))}
                </View>
              )}

              <View style={s.confirmBtns}>
                <TouchableOpacity
                  style={[s.confirmCancel, loading && s.btnDisabled]}
                  onPress={onCancel}
                  activeOpacity={0.8}
                  disabled={loading}
                >
                  <Text style={s.confirmCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.confirmDelete, loading && s.btnDisabled]}
                  activeOpacity={0.8}
                  onPress={onConfirm}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="trash-outline" size={13} color="#fff" />
                      <Text style={s.confirmDeleteText}>{confirmLabel}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ height: insets.bottom + 16 }} />
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet:   { borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden', ...SHADOW.sheet },
  handle:  { width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 2, alignSelf: 'center', marginTop: 14, marginBottom: 8 },

  confirmCard:       { marginHorizontal: 20, marginTop: 10, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 18, padding: 18, ...SHADOW.raised },
  confirmIconRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  confirmIconCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(239,68,68,0.2)', alignItems: 'center', justifyContent: 'center' },
  confirmIconEmoji:  { fontSize: 16 },
  confirmTitle:      { color: '#fff', fontSize: 15, fontWeight: '800', flex: 1 },
  confirmAction:     { fontSize: 13, fontWeight: '500', color: COLORS.textMuted, marginBottom: 8, lineHeight: 19 },
  confirmHighlight:  { color: '#fff', fontWeight: '700' },
  confirmDetail:     { color: COLORS.textFaint, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  confirmBullets:    { gap: 5, marginBottom: 16 },
  confirmBullet:     { color: COLORS.textFaint, fontSize: 11.5, lineHeight: 17 },
  confirmBtns:       { flexDirection: 'row', gap: 10 },
  confirmCancel:     { flex: 1, paddingVertical: 13, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, alignItems: 'center' },
  confirmCancelText: { color: COLORS.text, fontWeight: '700', fontSize: 13 },
  confirmDelete:     { flex: 1, paddingVertical: 13, backgroundColor: 'rgba(239,68,68,0.85)', borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  confirmDeleteText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  btnDisabled:       { opacity: 0.5 },
});

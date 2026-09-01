import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Font } from "@/theme/fonts";
import { blurActiveElementForModalWeb } from "@/utils/blurForModalWeb";

const GolfColors = {
  gold: "#D4AF37",
  forestDeep: "#071209",
};

const MIN_STROKES = 1;
const MAX_STROKES = 30;

type Props = {
  visible: boolean;
  holeNumber: number;
  strokes: number;
  onChangeStrokes: (n: number) => void;
  onClose: () => void;
  onSubmit: () => void;
  busy?: boolean;
};

export function HoleScoreModal({
  visible,
  holeNumber,
  strokes,
  onChangeStrokes,
  onClose,
  onSubmit,
  busy,
}: Props) {
  function bump(delta: number) {
    onChangeStrokes(
      Math.min(MAX_STROKES, Math.max(MIN_STROKES, strokes + delta)),
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onShow={blurActiveElementForModalWeb}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.sheetAlign} onStartShouldSetResponder={() => true}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.kicker}>Hole {holeNumber}</Text>
              <Text style={styles.title}>Enter Your Score</Text>
            </View>

            <View style={styles.stepper}>
              <Pressable
                onPress={() => bump(-1)}
                disabled={busy || strokes <= MIN_STROKES}
                style={({ pressed }) => [
                  pressed &&
                    !(busy || strokes <= MIN_STROKES) &&
                    styles.stepBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Decrease strokes"
              >
                <View
                  style={[
                    styles.stepBtnCircle,
                    (busy || strokes <= MIN_STROKES) &&
                      styles.stepBtnCircleDisabled,
                  ]}
                >
                  <MaterialIcons
                    name="remove"
                    size={22}
                    color={GolfColors.gold}
                  />
                </View>
              </Pressable>

              <View style={styles.countBlock}>
                <Text style={styles.bigNumber}>{strokes}</Text>
                <Text style={styles.strokesLabel}>strokes</Text>
              </View>

              <Pressable
                onPress={() => bump(1)}
                disabled={busy || strokes >= MAX_STROKES}
                style={({ pressed }) => [
                  pressed &&
                    !(busy || strokes >= MAX_STROKES) &&
                    styles.stepBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Increase strokes"
              >
                <View
                  style={[
                    styles.stepBtnCircle,
                    (busy || strokes >= MAX_STROKES) &&
                      styles.stepBtnCircleDisabled,
                  ]}
                >
                  <MaterialIcons name="add" size={22} color={GolfColors.gold} />
                </View>
              </Pressable>
            </View>

            <View style={styles.actions}>
              <Pressable
                onPress={onClose}
                disabled={busy}
                style={({ pressed }) => [
                  styles.cancelBtn,
                  pressed && styles.cancelBtnPressed,
                ]}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={onSubmit}
                disabled={busy}
                style={({ pressed }) => [
                  styles.submitBtnOuter,
                  pressed && styles.submitBtnPressed,
                  busy && styles.submitBtnDisabled,
                ]}
              >
                <View style={styles.submitBtnInner}>
                  <MaterialIcons
                    name="check"
                    size={18}
                    color={GolfColors.forestDeep}
                  />
                  <Text style={[styles.submitText, styles.submitTextAfterIcon]}>
                    Submit
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(10,20,10,0.82)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  sheetAlign: {
    width: "100%",
    maxWidth: 340,
    alignSelf: "center",
  },
  sheet: {
    width: "100%",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(58,90,58,0.45)",
    backgroundColor: "rgba(30,46,30,0.94)",
    paddingHorizontal: 22,
    paddingVertical: 22,
  },
  header: {
    alignItems: "center",
    marginBottom: 22,
  },
  kicker: {
    fontFamily: Font.bold,
    fontSize: 11,
    fontWeight: "normal",
    letterSpacing: 2,
    color: "rgba(107,152,114,0.8)",
    marginBottom: 6,
  },
  title: {
    fontFamily: Font.bold,
    fontSize: 20,
    fontWeight: "normal",
    color: "#FFFFFF",
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },
  stepBtnCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(212,175,55,0.14)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(212,175,55,0.55)",
  },
  stepBtnCircleDisabled: {
    opacity: 0.45,
  },
  stepBtnPressed: {
    opacity: 0.88,
  },
  countBlock: {
    alignItems: "center",
    minWidth: 100,
    marginHorizontal: 20,
  },
  bigNumber: {
    fontFamily: Font.black,
    fontSize: 56,
    fontWeight: "normal",
    color: "#FFFFFF",
    lineHeight: 58,
  },
  strokesLabel: {
    fontFamily: Font.regular,
    marginTop: 4,
    fontSize: 14,
    fontWeight: "normal",
    color: "rgba(184,212,191,0.7)",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(58,90,58,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnPressed: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  cancelText: {
    fontFamily: Font.bold,
    fontSize: 15,
    fontWeight: "normal",
    lineHeight: 20,
    color: "#FFFFFF",
  },
  submitBtnOuter: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "stretch",
  },
  submitBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: GolfColors.gold,
    borderRadius: 14,
    width: "100%",
    minHeight: 48,
  },
  submitTextAfterIcon: {
    marginLeft: 8,
  },
  submitBtnPressed: {
    opacity: 0.92,
  },
  submitBtnDisabled: {
    opacity: 0.55,
  },
  submitText: {
    fontFamily: Font.bold,
    fontSize: 15,
    fontWeight: "normal",
    lineHeight: 20,
    color: GolfColors.forestDeep,
  },
});

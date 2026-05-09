import { ActivityIndicator, Pressable, Text } from "react-native";

type Props = {
  label: string;
  onPress?: () => void;
  loading?: boolean;
  variant?: "gold" | "muted";
};

export function AppButton({ label, onPress, loading, variant = "gold" }: Props) {
  const gold = variant === "gold";
  return (
    <Pressable
      onPress={loading ? undefined : onPress}
      className={`rounded-[14px] py-[18px] px-4 items-center justify-center ${gold ? "bg-[#D4AF37]" : "border border-[#2A5030] bg-[#0F1A12]"}`}
    >
      {loading ? (
        <ActivityIndicator color={gold ? "#071209" : "#D4AF37"} />
      ) : (
        <Text
          className={`text-[15px] font-bold tracking-wide ${gold ? "text-[#071209]" : "text-white"}`}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

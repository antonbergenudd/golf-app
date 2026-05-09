import type { GameCard } from "../models/card";

export const CHALLENGE_CARDS: GameCard[] = [
  {
    id: "challenge_001",
    title: "Reverse Putt",
    description: "Putt one putt with the back of the putter",
    type: "challenge",
    points: 2,
  },
  {
    id: "challenge_002",
    title: "PGA player",
    description: "Tee off from white tee",
    type: "challenge",
    points: 3,
  },
  {
    id: "challenge_003",
    title: "Feet Together",
    description: "Hit a shot with your feet together",
    type: "challenge",
    points: 2,
  },
  {
    id: "challenge_004",
    title: "One Club Only - Club",
    description: "Play with only one club for the entire hole",
    type: "challenge",
    points: 7,
  },
  {
    id: "challenge_005",
    title: "One Shot Spin",
    description: "Hit a shot with a club from Wheel of Doom",
    type: "challenge",
    points: 2,
    requiresWheelSpin: true,
  },
  {
    id: "challenge_006",
    title: "Foot Putt",
    description: "Putt once with your foot",
    type: "challenge",
    points: 1,
  },
  {
    id: "challenge_007",
    title: "Eyes Closed",
    description: "Hit a putt with your eyes closed",
    type: "challenge",
    points: 2,
  },
  {
    id: "challenge_008",
    title: "Call Your Shot",
    description:
      "Before hitting, call where your ball will land (fairway/rough/etc.)",
    type: "challenge",
    points: 4,
  },
  {
    id: "challenge_009",
    title: "Low Stinger",
    description:
      "Hit a shot that stays below knee height for at least 20 meters",
    type: "challenge",
    points: 5,
  },
  {
    id: "challenge_010",
    title: "High Flop",
    description: "Hit the highest shot you can",
    type: "challenge",
    points: 4,
  },
  {
    id: "challenge_011",
    title: "No Practice",
    description: "Take your next shot with no practice swings",
    type: "challenge",
    points: 1,
  },
  {
    id: "challenge_012",
    title: "Happy Gilmore",
    description: "Take a running start before your shot",
    type: "challenge",
    points: 3,
  },
  {
    id: "challenge_013",
    title: "Worst Ball",
    description: "Hit two balls and play the worse result",
    type: "challenge",
    points: 3,
  },
  {
    id: "challenge_014",
    title: "Club Swap",
    description:
      "Another player chooses your club for this shot (putter not allowed)",
    type: "challenge",
    points: 3,
  },
  {
    id: "challenge_015",
    title: "Time Pressure",
    description: "You have 5 seconds to take your shot after setup",
    type: "challenge",
    points: 2,
  },
];

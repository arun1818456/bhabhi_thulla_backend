import User from "./model.js";
import { sendResponse } from "../../utils/sendResposeType.js";

// Segments matching wheel:
export const SPIN_SEGMENTS = [
  { index: 0, label: "100", coins: 100, probability: 25, color: "0xFF2E7D32" },
  { index: 1, label: "250", coins: 250, probability: 20, color: "0xFF1565C0" },
  { index: 2, label: "Retry", coins: 0, probability: 15, color: "0xFFEF6C00" },
  { index: 3, label: "500", coins: 500, probability: 10, color: "0xFF6A1B9A" },
  { index: 4, label: "Empty", coins: 0, probability: 12, color: "0xFF00695C" },
  { index: 5, label: "750", coins: 750, probability: 7, color: "0xFF283593" },
  { index: 6, label: "1,000", coins: 1000, probability: 5, color: "0xFFD84315" },
  { index: 7, label: "2,500", coins: 2500, probability: 3, color: "0xFFC2185B" },
  { index: 8, label: "5,000", coins: 5000, probability: 2, color: "0xFFF9A825" },
  { index: 9, label: "10,000", coins: 10000, probability: 1, color: "0xFFd32f2f" },
];

const getNextSpinCost = (dailySpinCount) => {
  switch (dailySpinCount) {
    case 0: return 0;   // 1st spin
    case 1: return 100; // 2nd spin
    case 2: return 200; // 3rd spin
    case 3: return 400; // 4th spin
    case 4: return 100; // 5th spin
    default: return -1; // limit reached
  }
};

const isNewDay = (lastSpinAt) => {
  if (!lastSpinAt) return true;
  const now = new Date();
  const lastSpin = new Date(lastSpinAt);
  return now.getFullYear() !== lastSpin.getFullYear() ||
         now.getMonth() !== lastSpin.getMonth() ||
         now.getDate() !== lastSpin.getDate();
};

const getRemainingMsToNextDay = () => {
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return nextMidnight.getTime() - now.getTime();
};

/**
 * Get spin status
 */
export const getSpinStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("coins lastSpinAt dailySpinCount pid name");
    if (!user) {
      return sendResponse(res, 404, false, "User not found", null);
    }

    let dailySpinCount = user.dailySpinCount || 0;
    if (isNewDay(user.lastSpinAt)) {
      dailySpinCount = 0;
    }

    const nextCost = getNextSpinCost(dailySpinCount);
    
    return sendResponse(res, 200, true, "Spin status retrieved", {
      dailySpinCount,
      lastSpinAt: user.lastSpinAt,
      nextSpinCost: nextCost,
      canSpin: nextCost !== -1,
      remainingMsToNextDay: getRemainingMsToNextDay(),
      coins: user.coins ?? 0,
      segments: SPIN_SEGMENTS,
    });
  } catch (error) {
    console.error("Error fetching spin status:", error);
    return sendResponse(res, 500, false, "Failed to fetch spin status", null, error.message);
  }
};

/**
 * Execute spin & update user coins in MongoDB
 */
export const playSpin = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return sendResponse(res, 404, false, "User not found", null);
    }

    let dailySpinCount = user.dailySpinCount || 0;
    if (isNewDay(user.lastSpinAt)) {
      dailySpinCount = 0;
    }

    const cost = getNextSpinCost(dailySpinCount);

    if (cost === -1) {
      return sendResponse(res, 400, false, "Daily spin limit reached.", {
        dailySpinCount,
        lastSpinAt: user.lastSpinAt,
        nextSpinCost: -1,
        canSpin: false,
        remainingMsToNextDay: getRemainingMsToNextDay(),
        coins: user.coins,
      });
    }

    if (user.coins < cost) {
        return sendResponse(res, 400, false, "Not enough coins for this spin.", {
            dailySpinCount,
            lastSpinAt: user.lastSpinAt,
            nextSpinCost: cost,
            canSpin: true,
            remainingMsToNextDay: getRemainingMsToNextDay(),
            coins: user.coins,
          });
    }

    // Weighted selection of winning segment
    const totalWeight = SPIN_SEGMENTS.reduce((sum, s) => sum + s.weight, 0);
    let rand = Math.random() * totalWeight;
    let selectedSegment = SPIN_SEGMENTS[0];

    for (const segment of SPIN_SEGMENTS) {
      if (rand < segment.weight) {
        selectedSegment = segment;
        break;
      }
      rand -= segment.weight;
    }

    const coinsWon = Number(selectedSegment.coins) || 0;
    const now = new Date();
    
    const coinDiff = coinsWon - cost;
    const incQuery = { totalSpins: 1 };
    if (coinDiff !== 0) {
        incQuery.coins = coinDiff;
    }

    // Atomic MongoDB coin update
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      {
        $inc: incQuery,
        $set: { 
            lastSpinAt: now,
            dailySpinCount: dailySpinCount + 1
         },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    const nextCostAfterSpin = getNextSpinCost(updatedUser.dailySpinCount);

    return sendResponse(res, 200, true, "Spin successful!", {
      targetIndex: selectedSegment.index,
      coinsWon: coinsWon,
      spinCost: cost,
      reward: selectedSegment,
      newCoins: updatedUser.coins,
      lastSpinAt: updatedUser.lastSpinAt,
      dailySpinCount: updatedUser.dailySpinCount,
      nextSpinCost: nextCostAfterSpin,
      canSpin: nextCostAfterSpin !== -1,
      remainingMsToNextDay: getRemainingMsToNextDay(),
    });
  } catch (error) {
    console.error("Error executing spin:", error);
    return sendResponse(res, 500, false, "Failed to process spin", null, error.message);
  }
};

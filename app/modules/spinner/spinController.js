import User from "../user/model.js";
import { sendResponse } from "../../utils/sendResposeType.js";


/**
 * Get spin status
 */
export const getSpinStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("coins diamonds lastSpinAt dailySpinCount pid name");
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
      remainingMsToNextDay: getRemainingMsToNextDay(),
      coins: user.coins ?? 0,
      diamonds: user.diamonds ?? 0,
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
    const { targetIndex } = req.body;

    if (targetIndex === undefined || targetIndex === null || !SPIN_SEGMENTS[targetIndex]) {
      return sendResponse(res, 400, false, "Invalid or missing targetIndex.", null);
    }

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
        diamonds: user.diamonds,
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

    const selectedSegment = SPIN_SEGMENTS[targetIndex];

    const coinsWon = Number(selectedSegment.coins) || 0;
    const diamondsWon = Number(selectedSegment.diamonds) || 0;
    const now = new Date();

    const coinDiff = coinsWon - cost;
    const incQuery = { totalSpins: 1 };
    if (coinDiff !== 0) {
      incQuery.coins = coinDiff;
    }
    if (diamondsWon !== 0) {
      incQuery.diamonds = diamondsWon;
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
      diamondsWon: diamondsWon,
      spinCost: cost,
      reward: selectedSegment,
      newCoins: updatedUser.coins,
      newDiamonds: updatedUser.diamonds,
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




///   utils functions 

// Segments matching wheel:

export const SPIN_SEGMENTS = [
  {
    index: 0,
    label: "100 Coins",
    coins: 100,
    diamonds: 0,
    probability: 22,
    color: "0xFF2E7D32",
  },
  {
    index: 1,
    label: "250 Coins",
    coins: 250,
    diamonds: 0,
    probability: 18,
    color: "0xFF1565C0",
  },
  {
    index: 2,
    label: "5 Diamonds",
    coins: 0,
    diamonds: 5,
    probability: 15,
    color: "0xFF00BCD4",
  },
  {
    index: 3,
    label: "500 Coins",
    coins: 500,
    diamonds: 0,
    probability: 10,
    color: "0xFF6A1B9A",
  },
  {
    index: 4,
    label: "Empty",
    coins: 0,
    diamonds: 0,
    probability: 12,
    color: "0xFF455A64",
  },
  {
    index: 5,
    label: "750 Coins",
    coins: 750,
    diamonds: 0,
    probability: 8,
    color: "0xFFFF8F00",
  },
  {
    index: 6,
    label: "10 Diamonds",
    coins: 0,
    diamonds: 10,
    probability: 8,
    color: "0xFF00ACC1",
  },
  {
    index: 7,
    label: "25 Diamonds",
    coins: 0,
    diamonds: 25,
    probability: 4,
    color: "0xFFEC407A",
  },
  {
    index: 8,
    label: "1000 Coins",
    coins: 1000,
    diamonds: 0,
    probability: 3,
    color: "0xFFFF5722",
  },
];

const getNextSpinCost = (dailySpinCount) => {
  switch (dailySpinCount) {
    case 0: return 0;   // 1st spin
    case 1: return 100; // 2nd spin
    case 2: return 200; // 3rd spin
    case 3: return 400; // 4th spin
    case 4: return 500; // 5th spin
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
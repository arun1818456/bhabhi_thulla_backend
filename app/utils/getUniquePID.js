import User from "../modules/user/model.js";

export const generateUniquePid = async () => {
    const min = 10000000;
    const max = 999999999999;

    for (let attempt = 0; attempt < 50; attempt += 1) {
        const pid = Math.floor(Math.random() * (max - min + 1)) + min;
        const exists = await User.exists({ pid });
        if (!exists) {
            return pid;
        }
    }

    throw new Error("Unable to generate unique pid after multiple attempts");
};

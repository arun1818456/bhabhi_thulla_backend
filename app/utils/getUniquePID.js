import User from "../modules/user/model.js";

export const generateUniquePid = async () => {
    const min = 10000000;
    const max = 99999999;

    while (true) {
        const pid =
            Math.floor(
                Math.random() * (max - min + 1)
            ) + min;

        // Same digit repeated avoid
        const pidString = String(pid);

        if (/^(\d)\1+$/.test(pidString)) {
            continue;
        }

        // Sequential numbers avoid
        if (
            pidString === "01234567" ||
            pidString === "12345678" ||
            pidString === "23456789" ||
            pidString === "98765432"
        ) {
            continue;
        }

        // Duplicate check
        const exists = await User.exists({ pid });

        if (!exists) {
            return pid;
        }
    }
};
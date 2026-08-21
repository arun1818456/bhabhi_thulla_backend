
export const getUser = async (userId) => {

    try {

        return await User.findById(userId);

    } catch (error) {

        console.error(
            "MongoDB getUser error:",
            error
        );

        return null;
    }
};

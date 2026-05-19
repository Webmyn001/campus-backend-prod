const mongoose = require("mongoose");
const dotenv = require("dotenv");
const User = require("../Models/User");

dotenv.config();

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("Connected.");
        const admin = await User.findOne({ role: "admin" });
        console.log("Admin user:", admin);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};
run();


import { client } from '../src/db/index';

async function checkSettings() {
    console.log("Checking settings table...");
    try {
        const res = await client.unsafe(`SELECT * FROM settings;`);
        console.log("Rows in settings:", res.length);
        console.log(JSON.stringify(res, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

checkSettings();

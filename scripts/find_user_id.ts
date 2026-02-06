import postgres from 'postgres';
import * as dotenv from 'dotenv';
import path from 'path';

// Fix path to .env
const envPath = path.resolve(process.cwd(), '.env');
console.log('Loading env from:', envPath);
dotenv.config({ path: envPath });

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!connectionString) {
    console.error('No DB URL found in env');
    process.exit(1);
}

const sql = postgres(connectionString);

async function findUsers() {
    try {
        console.log('Querying auth.users...');
        const users = await sql`SELECT id, email FROM auth.users`;
        console.log('Found users:', users);
        if (users.length > 0) {
            console.log('RECOMMENDED_USER_ID:', users[0].id);
        } else {
            console.log('No users found in auth.users');
        }
    } catch (e) {
        console.error('Could not query auth.users:', e);
    } finally {
        await sql.end();
    }
}
findUsers();

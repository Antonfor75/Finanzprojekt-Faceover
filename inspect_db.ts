
import { client } from './src/db/index';

async function inspect() {
    try {
        const result = await client`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN ('expenses', 'settings')
      ORDER BY table_name, ordinal_position;
    `;

        console.log(JSON.stringify(result, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

inspect();

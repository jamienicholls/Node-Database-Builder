import Knex from 'knex';
import schema from './schema.js';
import config from './config.js';

// Convert joi schema to simple array of objects 
const schemaDescription = schema.describe();
const keys = Object.getOwnPropertyNames(schemaDescription.keys)
  .map(fieldGroupName => ({
    tableName: fieldGroupName,
    tableFields: schemaDescription.keys[fieldGroupName].items[0].keys,
  }))


const buildDatabase = async () => {
  const db = Knex({
    client: 'mssql',
    connection: config.connection,
  });

  for await (const key of keys) {
    const tableExists = await db.schema.hasTable(key.tableName);
    if (!tableExists) {
      console.log(`Creating table: ${key.tableName}`)
      await db.schema.createTable(key.tableName, function (table) {
        Object.getOwnPropertyNames(key.tableFields).forEach(tf => {
          table.string(tf);
        });
      });
    } else {
      for await (const tf of Object.getOwnPropertyNames(key.tableFields)) {
        const columnExists = await db.schema.hasColumn(key.tableName, tf);
        if (!columnExists) {
          console.log(`Adding column (${tf}) to table (${key.tableName})`)
          await db.schema.alterTable(key.tableName, table => {
            table.string(tf);
          })
        }
      };
    }
  };
  db.destroy();
}

await buildDatabase();
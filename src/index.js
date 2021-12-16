import Knex from 'knex';
import schema from './schema.js';
import config from './config.js';

const getDatabaseTableFieldSchema = (tableName, tables, joiFields) => {
  const tableFields = [];
  Object.getOwnPropertyNames(joiFields).forEach(joiField => {
    const field = joiFields[joiField];

    if (field.type === 'array') {
      if (field.items && field.items[0].keys) {
        tables.push({
          tableName: `${tableName}_${joiField}`,
          tableFields: getDatabaseTableFieldSchema(`${tableName}_${joiField}`, tables, field.items[0].keys),
        });
      } else {
        tables.push({
          tableName: `${tableName}_${joiField}`,
          tableFields: getDatabaseTableFieldSchema(`${tableName}_${joiField}`, tables, { value: { type: 'string' } }),
        });
      }
    }
    tableFields.push({
      fieldName: joiField,
      type: field.type,
      unique: field.type === 'array' ? true : false,
      primaryKey: (field.rules || []).find(rule => rule.name === 'pk') ? true : false,
      forginKey: (field.rules || []).find(rule => rule.name === 'fk') ? (field.rules || []).find(rule => rule.name === 'fk').args.path : null,
      ...field,
    });
  });
  return tableFields;
}

const getDatabaseTableSchema = (tables) => {
  const joiSchemaDescription = schema.describe();
  Object.getOwnPropertyNames(joiSchemaDescription.keys)
    .forEach(fieldGroupName => {
      const joiFields = joiSchemaDescription.keys[fieldGroupName].items[0].keys;
      const tableFields = getDatabaseTableFieldSchema(fieldGroupName, tables, joiFields);
      tables.push({
        tableName: fieldGroupName,
        tableFields: tableFields,
      });
    });
}


const createTableField = (tf, table) => {
  if (tf.type === 'string') {
    table.string(tf.fieldName);
    table.unique(tf.fieldName);
  } else if (tf.type === 'date') {
    table.datetime(tf.fieldName);
  } else if (tf.type === 'number') {
    table.decimal(tf.fieldName);
  } else if (tf.type === 'boolean') {
    table.boolean(tf.fieldName);
  } else if (tf.type === 'array') {
    table.string(tf.fieldName);
    table.unique(tf.fieldName);
  } else {
    table.string(tf.fieldName);
    table.unique(tf.fieldName);
  }
}

const buildDatabase = async () => {
  const db = Knex({
    client: 'mssql',
    connection: config.connection,
  });

  const databaseTables = [];
  getDatabaseTableSchema(databaseTables);
  // Build database tables
  for await (const databaseTable of databaseTables) {
    const tableExists = await db.schema.hasTable(databaseTable.tableName);
    if (!tableExists) {
      console.log(`Creating table: ${databaseTable.tableName}`)
      await db.schema.createTable(databaseTable.tableName, table => {
        databaseTable.tableFields.forEach(tf => {
          createTableField(tf, table);
        });
        const primaryKeys = databaseTable.tableFields.filter(tf => tf.primaryKey).map(tf => tf.fieldName);
        if (primaryKeys.length) {
          table.primary(primaryKeys);
        }
      });
    } else {
      for await (const tf of databaseTable.tableFields) {
        const columnExists = await db.schema.hasColumn(databaseTable.tableName, tf.fieldName);
        if (!columnExists) {
          console.log(`Adding column (${tf.fieldName}) to table (${databaseTable.tableName})`)
          await db.schema.alterTable(databaseTable.tableName, table => {
            createTableField(tf, table);
          })
        }
      };
    }
  };
  // Add forgin keys
  for await (const databaseTable of databaseTables) {
    for await (const tf of databaseTable.tableFields) {
      await db.schema.alterTable(databaseTable.tableName, table => {
        if (tf.forginKey) {
          let tableName = tf.forginKey.split('.[].')[0];
          let tableReferenece = tf.forginKey.split('.[].')[1];
          if (tf.forginKey.split('.[].').length === 3) {
            tableName = `${tf.forginKey.split('.[].')[0]}_${tf.forginKey.split('.[].')[1]}`;
            tableReferenece = tf.forginKey.split('.[].')[2];
          }

          console.log(`Adding reference on (${tf.fieldName}) to (${tableReferenece}) in table (${tableName}) for table (${databaseTable.tableName})`)
          table.foreign(tf.fieldName).references(tableReferenece).inTable(tableName);
        }
      })
    }
  };

  db.destroy();
}

await buildDatabase();



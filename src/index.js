import Knex from 'knex';
import schema from './schema.js';
import config from './config.js';

const getDatabaseTableFieldSchema = (tableName, tables, joiFields) => {
  const tableFields = [];
  // Iterate through each field for current table
  Object.getOwnPropertyNames(joiFields).forEach(joiField => {
    const field = joiFields[joiField];
    if (field.type === 'array') {
      const joiChildFields = (field.items[0] && field.items[0].keys) ? field.items[0].keys : { value: { type: 'string' } };
      const childTableFields = getDatabaseTableFieldSchema(`${tableName}_${joiField}`, tables, joiChildFields, field);
      // Iterate through each field in parent table and add the primary keys to the link table
      Object.getOwnPropertyNames(joiFields).forEach(joiField => {
        const field = joiFields[joiField];
        if ((field.rules || [] ).find(rule => rule.name === 'pk')){
          childTableFields.push({
            fieldName: joiField,
            type: field.type,
            primaryKey: true,
            foreignKey: `${tableName}.[].${joiField}`,
          });
        }
      });
      tables.push({
        tableName: `${tableName}_${joiField}`,
        tableFields: childTableFields,
      });
    } else {
      tableFields.push({
        fieldName: joiField,
        type: field.type,
        primaryKey: (field.rules || []).find(rule => rule.name === 'pk') ? true : false,
        foreignKey: (field.rules || []).find(rule => rule.name === 'fk') ? (field.rules || []).find(rule => rule.name === 'fk').args.path : null,
      });
    }
  });
  return tableFields;
}

const getDatabaseTableSchema = () => {
  let tables = [];
  const joiSchemaDescription = schema.describe();
  Object.getOwnPropertyNames(joiSchemaDescription.keys)
    .forEach(tableName => {
      const joiFields = joiSchemaDescription.keys[tableName].items[0].keys;
      const tableFields = getDatabaseTableFieldSchema(tableName, tables, joiFields);
      tables.push({
        tableName: tableName,
        tableFields: tableFields,
      });
    });
  return tables;
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


const buildDatabase = async (schema) => {
  // Create Database Connection
  const db = Knex({
    client: 'mssql',
    connection: config.connection,
  });

  // Get tables object
  const schemaDescription = schema.describe();
  const databaseTables = getDatabaseTableSchema(schemaDescription);
  console.log(databaseTables);


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
    if (!(databaseTable.tableName === 'dataConnections_dataEntities' 
    || databaseTable.tableName === 'dataConnections_integrationTechnologies' 
    || databaseTable.tableName === 'technologyMetricAssessments_assessments' 
    || databaseTable.tableName === 'componentConnections_tags'
    || databaseTable.tableName === 'capabilities_valueChainSegments' 
    || databaseTable.tableName === 'networkConnections_technologies')){
      // todo, handle multiple fk
    for await (const tf of databaseTable.tableFields) {
      await db.schema.alterTable(databaseTable.tableName, table => {
        if (tf.foreignKey) {
          let tableName = tf.foreignKey.split('.[].')[0];
          let tableReferenece = tf.foreignKey.split('.[].')[1];
          if (tf.foreignKey.split('.[].').length === 3) {
            tableName = `${tf.foreignKey.split('.[].')[0]}_${tf.foreignKey.split('.[].')[1]}`;
            tableReferenece = tf.foreignKey.split('.[].')[2];
          }

          console.log(`Adding reference on (${tf.fieldName}) to (${tableReferenece}) in table (${tableName}) for table (${databaseTable.tableName})`)
          table.foreign(tf.fieldName).references(tableReferenece).inTable(tableName);
        }
      })
    }
  }
  };

  db.destroy();
}

await buildDatabase(schema);



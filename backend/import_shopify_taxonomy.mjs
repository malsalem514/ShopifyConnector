import oracledb from 'oracledb';

const DB_CONFIG = {
  user: 'attr_mgr',
  password: 'attr_mgr_dev',
  connectString: 'localhost:1521/FREEPDB1'
};

const CATEGORIES_URL = 'https://raw.githubusercontent.com/Shopify/product-taxonomy/main/dist/en/categories.json';
const ATTRIBUTES_URL = 'https://raw.githubusercontent.com/Shopify/product-taxonomy/main/dist/en/attributes.json';

async function fetchJson(url) {
  console.log(`📡 Fetching ${url}...`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  return response.json();
}

async function main() {
  try {
    const categoriesData = await fetchJson(CATEGORIES_URL);
    const attributesData = await fetchJson(ATTRIBUTES_URL);

    const versionTag = 'v1';
    const source = `Shopify OSS (${categoriesData.version})`;
    
    const transformed = {
      categories: [],
      attributes: [],
      category_attributes: []
    };

    // 1. Attributes (Deduplicated)
    const processedAttributes = new Set();
    attributesData.attributes.forEach(attr => {
      const code = attr.id.split('/').pop();
      if (processedAttributes.has(code)) return;
      processedAttributes.add(code);

      transformed.attributes.push({
        code: code,
        name: attr.name,
        type: 'select',
        description: attr.description || ''
      });
    });

    // 2. Categories & Associations (Deduplicated)
    const processedCategories = new Set();
    const processedAssociations = new Set();

    categoriesData.verticals.forEach(vertical => {
      vertical.categories.forEach(cat => {
        const id = cat.id.split('/').pop();
        if (processedCategories.has(id)) return;
        processedCategories.add(id);

        const parentId = cat.parent_id ? cat.parent_id.split('/').pop() : null;

        transformed.categories.push({
          id: id,
          name: cat.name,
          path: cat.full_name,
          parent_id: parentId
        });

        if (cat.attributes) {
          cat.attributes.forEach(attrRef => {
            const attrCode = attrRef.id.split('/').pop();
            const assocKey = `${id}|${attrCode}`;
            
            if (processedAssociations.has(assocKey)) return;
            processedAssociations.add(assocKey);

            transformed.category_attributes.push({
              category_id: id,
              attribute_code: attrCode,
              required: 'N',
              cardinality: 'single'
            });
          });
        }
      });
    });

    console.log(`✅ Transformed Data:`);
    console.log(`   - Categories: ${transformed.categories.length}`);
    console.log(`   - Attributes: ${transformed.attributes.length}`);
    console.log(`   - Associations: ${transformed.category_attributes.length}`);

    // 3. Connect and Import
    console.log('🔗 Connecting to Oracle...');
    const connection = await oracledb.getConnection(DB_CONFIG);

    // Check if version exists and cleanup if needed
    const checkRes = await connection.execute(
      `SELECT COUNT(*) as cnt FROM ATTR_MGR.EXT_TAXONOMY_VERSION WHERE VERSION_TAG = :tag`,
      { tag: versionTag }
    );
    
    if (checkRes.rows[0][0] > 0) {
      console.log(`🧹 Cleaning up existing version ${versionTag}...`);
      await connection.execute(`DELETE FROM ATTR_MGR.TENANT_CATEGORY_MAP WHERE VERSION_TAG = :tag`, { tag: versionTag });
      await connection.execute(`DELETE FROM ATTR_MGR.EXT_TAXONOMY_CATEGORY_ATTR WHERE VERSION_TAG = :tag`, { tag: versionTag });
      await connection.execute(`DELETE FROM ATTR_MGR.EXT_TAXONOMY_CATEGORY WHERE VERSION_TAG = :tag`, { tag: versionTag });
      await connection.execute(`DELETE FROM ATTR_MGR.EXT_TAXONOMY_ATTRIBUTE WHERE VERSION_TAG = :tag`, { tag: versionTag });
      await connection.execute(`DELETE FROM ATTR_MGR.EXT_TAXONOMY_VERSION WHERE VERSION_TAG = :tag`, { tag: versionTag });
      await connection.commit();
    }

    console.log('📥 Calling ATTR_MGR.TAXONOMY_PKG.import_taxonomy...');
    const jsonString = JSON.stringify(transformed);
    console.log(`   - JSON Payload Size: ${(jsonString.length / 1024 / 1024).toFixed(2)} MB`);

    await connection.execute(
      `BEGIN ATTR_MGR.TAXONOMY_PKG.import_taxonomy(:ver, :src, :json, :chk, 'N'); END;`,
      {
        ver: versionTag,
        src: source,
        json: jsonString,
        chk: `sha256-${Date.now()}`
      }
    );

    await connection.commit();
    console.log('🎉 Full Shopify Taxonomy imported successfully!');
    
    const countRes = await connection.execute(
      `SELECT 
        (SELECT COUNT(*) FROM ATTR_MGR.EXT_TAXONOMY_CATEGORY WHERE VERSION_TAG = :tag) as cat_cnt,
        (SELECT COUNT(*) FROM ATTR_MGR.EXT_TAXONOMY_ATTRIBUTE WHERE VERSION_TAG = :tag) as attr_cnt
       FROM DUAL`,
      { tag: versionTag }
    );
    console.log(`📊 Final Counts in DB: ${countRes.rows[0][0]} Categories, ${countRes.rows[0][1]} Attributes`);

    await connection.close();

  } catch (err) {
    console.error('❌ Import failed:', err);
    process.exit(1);
  }
}

main();

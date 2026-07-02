const express = require('express');
const pool = require('../config/db');
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const asyncHandler = require('../utils/async-handler');
const AppError = require('../utils/app-error');
const { writeAudit } = require('../services/audit.service');
const { productSchema, idSchema, masterDataListSchema, documentReasonSchema } = require('../validators/schemas');

const router = express.Router();
router.use(authenticate);

router.get('/', validate(masterDataListSchema, 'query'), asyncHandler(async (req, res) => {
    const { search, page, limit, status } = req.query;
    const offset = (page - 1) * limit;
    const pattern = `%${search}%`;
    const statusCondition = `( $3 = 'all' OR ($3 = 'active' AND active=TRUE) OR ($3 = 'inactive' AND active=FALSE) )`;
    const result = await pool.query(
        `SELECT * FROM products WHERE ${statusCondition}
         AND ($1='' OR name ILIKE $2 OR COALESCE(sku,'') ILIKE $2 OR COALESCE(category,'') ILIKE $2)
         ORDER BY active DESC, name LIMIT $4 OFFSET $5`,
        [search, pattern, status, limit, offset]
    );
    const count = await pool.query(
        `SELECT COUNT(*)::integer AS total FROM products WHERE ${statusCondition}
         AND ($1='' OR name ILIKE $2 OR COALESCE(sku,'') ILIKE $2 OR COALESCE(category,'') ILIKE $2)`,
        [search, pattern, status]
    );
    res.json({ data: result.rows, pagination: { page, limit, total: count.rows[0].total } });
}));

router.get('/:id', validate(idSchema, 'params'), asyncHandler(async (req, res) => {
    const result = await pool.query('SELECT * FROM products WHERE id=$1', [req.params.id]);
    if (!result.rows[0]) throw new AppError(404, 'ไม่พบสินค้า/บริการ', 'PRODUCT_NOT_FOUND');
    res.json({ data: result.rows[0] });
}));

router.post('/', authorize('admin', 'staff'), validate(productSchema), asyncHandler(async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const b=req.body;
        const result=await client.query(
          `INSERT INTO products (sku,name,item_type,unit,price,category,active)
           VALUES ($1,$2,$3,$4,$5,$6,TRUE) RETURNING *`,
          [b.sku,b.name,b.item_type,b.unit,b.price,b.category]
        );
        await writeAudit(client,{userId:req.user.id,action:'CREATE',entityType:'product',entityId:result.rows[0].id,details:{name:b.name,sku:b.sku,item_type:b.item_type,price:b.price}});
        await client.query('COMMIT');
        res.status(201).json({data:result.rows[0]});
    } catch(error){ await client.query('ROLLBACK').catch(()=>{}); throw error; }
    finally { client.release(); }
}));

router.put('/:id', authorize('admin', 'staff'), validate(idSchema, 'params'), validate(productSchema), asyncHandler(async (req,res)=>{
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const beforeResult=await client.query('SELECT * FROM products WHERE id=$1 FOR UPDATE',[req.params.id]);
      const before=beforeResult.rows[0];
      if(!before) throw new AppError(404,'ไม่พบสินค้า/บริการ','PRODUCT_NOT_FOUND');
      if(!before.active) throw new AppError(409,'รายการนี้ถูกปิดใช้งานแล้ว กรุณากู้คืนก่อนแก้ไข','PRODUCT_INACTIVE');
      const b=req.body;
      const result=await client.query(
        `UPDATE products SET sku=$1,name=$2,item_type=$3,unit=$4,price=$5,category=$6 WHERE id=$7 RETURNING *`,
        [b.sku,b.name,b.item_type,b.unit,b.price,b.category,req.params.id]
      );
      const after=result.rows[0];
      await writeAudit(client,{userId:req.user.id,action:'UPDATE',entityType:'product',entityId:after.id,details:{before:{name:before.name,sku:before.sku,item_type:before.item_type,unit:before.unit,price:before.price,category:before.category},after:{name:after.name,sku:after.sku,item_type:after.item_type,unit:after.unit,price:after.price,category:after.category}}});
      await client.query('COMMIT'); res.json({data:after});
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}));

router.post('/:id/deactivate', authorize('admin'), validate(idSchema,'params'), validate(documentReasonSchema), asyncHandler(async(req,res)=>{
 const client=await pool.connect(); try{ await client.query('BEGIN');
 const result=await client.query(`UPDATE products SET active=FALSE,deactivated_at=NOW(),deactivated_by=$2,deactivation_reason=$3 WHERE id=$1 AND active=TRUE RETURNING *`,[req.params.id,req.user.id,req.body.reason]);
 if(!result.rows[0]){const exists=await client.query('SELECT id,active FROM products WHERE id=$1',[req.params.id]); if(!exists.rows[0]) throw new AppError(404,'ไม่พบสินค้า/บริการ','PRODUCT_NOT_FOUND'); throw new AppError(409,'รายการนี้ถูกปิดใช้งานอยู่แล้ว','PRODUCT_ALREADY_INACTIVE');}
 await writeAudit(client,{userId:req.user.id,action:'DEACTIVATE',entityType:'product',entityId:result.rows[0].id,details:{name:result.rows[0].name,reason:req.body.reason}}); await client.query('COMMIT'); res.json({data:result.rows[0]});
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}));

router.post('/:id/restore', authorize('admin'), validate(idSchema,'params'), asyncHandler(async(req,res)=>{
 const client=await pool.connect(); try{await client.query('BEGIN');
 const result=await client.query(`UPDATE products SET active=TRUE,deactivated_at=NULL,deactivated_by=NULL,deactivation_reason=NULL WHERE id=$1 AND active=FALSE RETURNING *`,[req.params.id]);
 if(!result.rows[0]){const exists=await client.query('SELECT id,active FROM products WHERE id=$1',[req.params.id]); if(!exists.rows[0]) throw new AppError(404,'ไม่พบสินค้า/บริการ','PRODUCT_NOT_FOUND'); throw new AppError(409,'รายการนี้เปิดใช้งานอยู่แล้ว','PRODUCT_ALREADY_ACTIVE');}
 await writeAudit(client,{userId:req.user.id,action:'RESTORE',entityType:'product',entityId:result.rows[0].id,details:{name:result.rows[0].name}}); await client.query('COMMIT'); res.json({data:result.rows[0]});
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}));
module.exports=router;

import VanillaJoi from 'joi';
import { fkExtension, pkExtension } from 'joi-key-extensions';

const Joi = VanillaJoi
  .extend(fkExtension.string)
  .extend(pkExtension.array)
  .extend(pkExtension.string)
  .extend(pkExtension.date)
  .extend(pkExtension.number);

// Create simple schema
const customerSchema = Joi.object({
    customerId: Joi.string().pk(),
    customerName: Joi.string(),
    country: Joi.string(),
});
const orderSchema = Joi.object({
    orderId: Joi.string().pk(),
    customerId: Joi.string().fk('customer.[].customerId'),
    country: Joi.string(),
    date: Joi.string(),
});
const schema = Joi.object({
    customer: Joi.array().items(customerSchema).optional().uniqueOnPks(),
    order: Joi.array().items(orderSchema).optional().uniqueOnPks(),
})

export default schema;
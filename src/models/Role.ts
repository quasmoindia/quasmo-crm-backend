import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IRole extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  label: string;
  moduleIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface IRoleModel extends Model<IRole> {}

const roleSchema = new Schema<IRole>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    moduleIds: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

export const Role = mongoose.model<IRole, IRoleModel>('Role', roleSchema);

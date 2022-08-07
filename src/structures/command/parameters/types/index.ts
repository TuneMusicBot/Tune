import { ActivityParameter } from "./ActivityParameter";
import { AttachmentParameter } from "./AttachmentParameter";
import { BooleanFlagParameter } from "./BooleanFlagParameter";
import { MemberParameter } from "./MemberParameter";
import { Parameter } from "./Parameter";
import { RoleParameter } from "./RoleParameter";
import { StringParameter } from "./StringParameter";
import { UserParamenter } from "./UserParameter";

export = {
  activity: new ActivityParameter(),
  attachment: new AttachmentParameter(),
  booleanFlag: new BooleanFlagParameter(),
  member: new MemberParameter(),
  role: new RoleParameter(),
  string: new StringParameter(),
  user: new UserParamenter(),
} as Record<string, Parameter<any, any, any>>;

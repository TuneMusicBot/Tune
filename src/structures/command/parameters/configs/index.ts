import { AttachmentParameter } from "./AttachmentParameter";
import { BooleanFlagParameter } from "./BooleanFlagParameter";
import { MessageParameter } from "./MessageParameter";
import { StringParameter } from "./StringParameter";

export = {
  attachment: new AttachmentParameter(),
  booleanFlag: new BooleanFlagParameter(),
  message: new MessageParameter(),
  string: new StringParameter(),
};

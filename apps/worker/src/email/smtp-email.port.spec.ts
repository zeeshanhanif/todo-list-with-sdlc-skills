import * as nodemailer from "nodemailer";
import { SmtpEmailPort } from "./smtp-email.port";

describe("SmtpEmailPort", () => {
  it("sends the message through the transport with the configured from address", async () => {
    // jsonTransport serializes instead of hitting a real server.
    const transporter = nodemailer.createTransport({ jsonTransport: true });
    const sendMail = jest.spyOn(transporter, "sendMail");

    await new SmtpEmailPort(transporter, "To-Do <no-reply@todo.local>").send({
      to: "user@example.com",
      subject: "Verify your email",
      text: "link",
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "To-Do <no-reply@todo.local>",
        to: "user@example.com",
        subject: "Verify your email",
        text: "link",
      }),
    );
  });
});

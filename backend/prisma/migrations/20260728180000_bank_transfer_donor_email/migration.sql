-- Guest / donor contact email for bank-transfer status notifications.
ALTER TABLE "BankTransferIntent" ADD COLUMN "donorEmail" TEXT;

import type { CustomerProfile, SupportChannel } from '@careflow/shared';

export interface UpsertCustomerInput {
  organizationId: string;
  displayName: string;
  email?: string;
  externalRef?: string;
  preferredChannel: SupportChannel;
}

export interface CustomerRepositoryPort {
  findById(organizationId: string, customerId: string): Promise<CustomerProfile | null>;
  findByExternalRef(organizationId: string, externalRef: string): Promise<CustomerProfile | null>;
  upsertCustomer(input: UpsertCustomerInput): Promise<CustomerProfile>;
}

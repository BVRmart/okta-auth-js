import { createOktaAuthCore } from '../../core/factory';
import { OktaAuthConstructor, OktaAuthOptionsConstructor } from '../../base/types';
import { StorageManagerConstructor } from '../../storage/types';
import { IdxTransactionManagerInterface, OktaAuthIdxInterface } from '../types/api';
import { IdxTransactionMeta } from '../types/meta';
import { IdxStorageManagerInterface } from '../types/storage';
import { OktaAuthIdxOptions } from '../types/options';
import { mixinIdx } from '../mixin';
import { TransactionManagerConstructor } from '../../oidc/types';

export function createOktaAuthIdx<
  M extends IdxTransactionMeta = IdxTransactionMeta,
  S extends IdxStorageManagerInterface<M> = IdxStorageManagerInterface<M>,
  O extends OktaAuthIdxOptions<M, S> = OktaAuthIdxOptions<M, S>,
  TM extends IdxTransactionManagerInterface = IdxTransactionManagerInterface
>(
  StorageManagerConstructor: StorageManagerConstructor<S>,
  OptionsConstructor: OktaAuthOptionsConstructor<O>,
  TransactionManagerConstructor: TransactionManagerConstructor<M, S, TM>
)
: OktaAuthConstructor<O, OktaAuthIdxInterface<M, S, O, TM>>
{
  const Core = createOktaAuthCore<M, S, O, TM>(
    StorageManagerConstructor,
    OptionsConstructor,
    TransactionManagerConstructor
  );
  const WithIdx = mixinIdx<M, S, O, TM>(Core);
  return WithIdx;
}

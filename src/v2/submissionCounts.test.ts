import {it,expect} from 'vitest';
import {submissionCounts} from './submissionCounts';
it('counts newly created jobs in selected-item submissions and batch submissions',()=>{
 expect(submissionCounts({group_id:'selected',items:[{created:true},{created:false}]})).toEqual({created:1,existing:1});
 expect(submissionCounts({group_id:'batch',created:2,existing:8})).toEqual({created:2,existing:8});
 expect(submissionCounts({group_id:'replay',items:[{created:false}]})).toEqual({created:0,existing:1});
 expect(()=>submissionCounts({group_id:'invalid'})).toThrow('Open Downloads');
});

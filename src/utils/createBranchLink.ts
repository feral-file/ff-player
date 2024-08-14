import axios from 'axios';

const createBranchLink = async (data: object): Promise<string> => {
  const response = await axios.post('https://api2.branch.io/v1/url', {
    branch_key: process.env.NEXT_PUBLIC_BRANCH_KEY,
    data,
  });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
  return response.data.url;
};

export default createBranchLink;
